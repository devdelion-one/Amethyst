import hashlib
import hmac
import json
import os
import secrets
import socket
import sys
import time
import traceback

MAX_MSG = 4 * 1024 * 1024
RETRY_S = 2.0
HELLO_S = 5.0


def proof(key, role, nonce):
    return hmac.new(key, (role + '|' + nonce).encode('utf-8'), hashlib.sha256).hexdigest()


class Link:
    def __init__(self, file, info, run):
        self.file = file
        self.info = info
        self.run = run
        self.sock = None
        self.buf = b''
        self.stage = ''
        self.key = b''
        self.nonce = ''
        self.since = 0.0
        self.next_try = 0.0
        self.busy = False

    def drop(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
        self.sock = None
        self.buf = b''
        self.stage = ''
        self.key = b''
        self.next_try = time.monotonic() + RETRY_S

    def connect(self):
        if time.monotonic() < self.next_try:
            return
        self.next_try = time.monotonic() + RETRY_S
        try:
            with open(self.file, 'r', encoding='utf-8') as f:
                conf = json.load(f)
            key = bytes.fromhex(conf['key'])
            port = int(conf['port'])
            sock = socket.create_connection(('127.0.0.1', port), timeout=0.5)
        except Exception:
            return
        sock.setblocking(False)
        self.sock = sock
        self.key = key
        self.stage = 'hello'
        self.since = time.monotonic()

    def send(self, msg):
        data = (json.dumps(msg) + '\n').encode('utf-8')
        self.sock.settimeout(10)
        try:
            self.sock.sendall(data)
        finally:
            if self.sock:
                self.sock.setblocking(False)

    def handle(self, m):
        t = m.get('t') if isinstance(m, dict) else None
        if self.stage == 'hello':
            if t != 'hello' or not isinstance(m.get('nonce'), str) or len(m['nonce']) < 32:
                return self.drop()
            self.nonce = secrets.token_hex(32)
            self.stage = 'proof'
            return self.send({'t': 'hello', 'nonce': self.nonce, 'proof': proof(self.key, 'editor', m['nonce'])})
        if self.stage == 'proof':
            got = m.get('proof') if t == 'proof' else None
            if not isinstance(got, str) or not hmac.compare_digest(got, proof(self.key, 'server', self.nonce)):
                return self.drop()
            self.stage = 'ready'
            return self.send(dict(self.info(), t='info'))
        if self.stage == 'ready' and t == 'command':
            self.busy = True
            try:
                ok, result, output = self.run(str(m.get('command', '')), str(m.get('exec_mode', 'ExecuteStatement')))
            except Exception as e:
                ok, result, output = False, repr(e), []
            finally:
                self.busy = False
            if self.sock:
                self.send({'t': 'result', 'id': m.get('id'), 'success': bool(ok), 'result': str(result), 'output': output})

    def tick(self, *_):
        if self.busy:
            return
        try:
            if not self.sock:
                self.connect()
                if not self.sock:
                    return
            if self.stage != 'ready' and time.monotonic() - self.since > HELLO_S:
                return self.drop()
            while self.sock:
                try:
                    chunk = self.sock.recv(65536)
                except (BlockingIOError, InterruptedError):
                    break
                if not chunk:
                    return self.drop()
                self.buf += chunk
                if len(self.buf) > MAX_MSG:
                    return self.drop()
            while self.sock and b'\n' in self.buf:
                raw, self.buf = self.buf.split(b'\n', 1)
                self.handle(json.loads(raw.decode('utf-8')))
        except Exception:
            self.drop()


def runner(execute):
    state = {'cmd': '', 'mode': '', 'err': ''}

    def call():
        scope = dict(sys.modules['__main__'].__dict__)
        if 'unreal' in sys.modules:
            scope.setdefault('unreal', sys.modules['unreal'])
        try:
            if state['mode'] == 'EvaluateStatement':
                return eval(compile(state['cmd'], '<string>', 'eval'), scope)
            exec(compile(state['cmd'], '<string>', 'exec'), scope)
        except BaseException:
            t, v, tb = sys.exc_info()
            state['err'] = ''.join(traceback.format_exception(t, v, tb.tb_next)).rstrip()
            raise

    sys._amethyst_link_call = call

    def run(command, mode):
        state.update(cmd=command, mode=mode, err='')
        ok, result, output = execute("__import__('sys')._amethyst_link_call()", 'EvaluateStatement' if mode == 'EvaluateStatement' else 'ExecuteStatement')
        if not ok:
            result = state['err'] or result
        return ok, result, output

    return run


def editor():
    import unreal

    modes = {
        'ExecuteFile': unreal.PythonCommandExecutionMode.EXECUTE_FILE,
        'ExecuteStatement': unreal.PythonCommandExecutionMode.EXECUTE_STATEMENT,
        'EvaluateStatement': unreal.PythonCommandExecutionMode.EVALUATE_STATEMENT,
    }

    def kind(entry):
        name = str(getattr(entry.type, 'name', entry.type)).split('.')[-1].lower()
        return {'warning': 'Warning', 'error': 'Error'}.get(name, 'Info')

    def execute(command, mode):
        r = unreal.PythonScriptLibrary.execute_python_command_ex(command, modes[mode], unreal.PythonFileExecutionScope.PRIVATE)
        if isinstance(r, tuple) and len(r) == 3:
            ok, result, log = r
        elif isinstance(r, tuple) and len(r) == 2:
            ok, (result, log) = True, r
        else:
            ok, result, log = bool(r), '', []
        return ok, result, [{'type': kind(e), 'output': str(e.output)} for e in (log or [])]

    def info():
        return {
            'pid': os.getpid(),
            'project_root': unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()),
            'project_name': unreal.SystemLibrary.get_game_name(),
            'engine_version': unreal.SystemLibrary.get_engine_version(),
        }

    file = os.environ.get('AMETHYST_UE_LINK', '')
    if not file or getattr(sys, '_amethyst_link', None):
        return
    link = Link(file, info, runner(execute))
    sys._amethyst_link = link
    unreal.register_slate_post_tick_callback(link.tick)


def plain(file):
    def execute(command, mode):
        main = sys.modules['__main__'].__dict__
        try:
            if mode == 'EvaluateStatement':
                return True, repr(eval(command, main)), []
            exec(command, main)
            return True, 'None', []
        except BaseException:
            return False, '', []

    inner = runner(execute)

    def run(command, mode):
        ok, result, output = inner(command, mode)
        print('RAN ' + json.dumps({'command': command, 'ok': ok, 'result': result}), flush=True)
        return ok, result, output

    link = Link(file, lambda: {'pid': os.getpid(), 'project_root': '', 'project_name': '', 'engine_version': ''}, run)
    end = time.monotonic() + float(os.environ.get('AMETHYST_LINK_TEST_S', '3'))
    was = None
    while time.monotonic() < end:
        link.tick()
        if link.stage != was:
            was = link.stage
            print('STAGE ' + (was or '-'), flush=True)
        time.sleep(0.05)


try:
    import unreal
except ImportError:
    unreal = None

if unreal:
    editor()
elif len(sys.argv) > 1:
    plain(sys.argv[1])
