import json
import os
import sys
import unreal


def write_result(res_path, payload):
    tmp_path = res_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    os.replace(tmp_path, res_path)


def package_to_filename(pkg):
    for ext in (".uasset", ".umap"):
        try:
            rel = unreal.PackageName.long_package_name_to_filename(pkg, ext)
            full = unreal.Paths.convert_relative_path_to_full(rel)
            if full and os.path.isfile(full):
                return os.path.normpath(full)
        except Exception:
            pass
    return ""


def get_pkg_deps(reg, pkg, include_soft):
    opts = unreal.AssetRegistryDependencyOptions(
        include_soft_package_references=bool(include_soft),
        include_hard_package_references=True,
        include_searchable_names=False,
        include_soft_management_references=False,
        include_hard_management_references=False,
    )
    raw = reg.get_dependencies(pkg, opts)
    if not raw:
        return []
    return [str(x) for x in raw if str(x)]


def scan_deps(paths, include_soft, recursive):
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    if hasattr(reg, "wait_for_completion"):
        reg.wait_for_completion()
    seen = set()
    queue = list(paths)
    project_deps = set()
    engine_deps = set()
    script_deps = set()
    roots = set(paths)
    while queue:
        cur = queue.pop(0)
        if cur in seen:
            continue
        seen.add(cur)
        for dep in get_pkg_deps(reg, cur, include_soft):
            if dep.startswith("/Script/"):
                script_deps.add(dep)
            elif dep.startswith("/Engine/"):
                engine_deps.add(dep)
            else:
                if dep not in roots:
                    project_deps.add(dep)
                if recursive and dep not in seen:
                    queue.append(dep)
    return sorted(project_deps), sorted(engine_deps), sorted(script_deps)


def op_deps(req):
    pkg = req["path"]
    include_soft = bool(req.get("soft", False))
    recursive = bool(req.get("recursive", False))
    project_deps, engine_deps, script_deps = scan_deps([pkg], include_soft, recursive)
    root_file = package_to_filename(pkg)
    files = {}
    if root_file:
        files[pkg] = root_file
    for dep in project_deps:
        f = package_to_filename(dep)
        if f:
            files[dep] = f
    return {
        "path": pkg,
        "exists": bool(root_file) or unreal.EditorAssetLibrary.does_asset_exist(pkg),
        "project": project_deps,
        "engine": engine_deps,
        "script": script_deps,
        "files": files,
    }


def op_migrate(req):
    paths = list(req["paths"])
    include_soft = bool(req.get("soft", False))
    project_deps, engine_deps, script_deps = scan_deps(paths, include_soft, True)
    all_pkgs = sorted(set(paths) | set(project_deps))
    files = []
    missing = []
    for pkg in all_pkgs:
        f = package_to_filename(pkg)
        if f:
            files.append({"package": pkg, "file": f})
        else:
            missing.append(pkg)
    return {
        "packages": all_pkgs,
        "files": files,
        "scriptDeps": script_deps,
        "engineDeps": engine_deps,
        "missing": missing,
    }


def op_move(req):
    src = req["from"]
    dst = req["to"]
    if not unreal.EditorAssetLibrary.does_asset_exist(src):
        raise RuntimeError("source asset does not exist: " + src)
    if unreal.EditorAssetLibrary.does_asset_exist(dst):
        raise RuntimeError("destination asset already exists: " + dst)
    asset = unreal.EditorAssetLibrary.load_asset(src)
    if asset is None:
        raise RuntimeError("could not load source asset: " + src)
    dest_path, dest_name = dst.rsplit("/", 1)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    rename_data = unreal.AssetRenameData(asset, dest_path, dest_name)
    ok = tools.rename_assets([rename_data])
    if not ok:
        raise RuntimeError("failed to move asset from " + src + " to " + dst)
    unreal.EditorAssetLibrary.save_asset(dst, only_if_is_dirty=False)
    try:
        unreal.EditorLoadingAndSavingUtils.save_dirty_packages(False, True)
    except Exception:
        pass
    src_folder = src.rsplit("/", 1)[0]
    fixed = False
    if hasattr(unreal.EditorAssetLibrary, "fixup_redirectors"):
        try:
            unreal.EditorAssetLibrary.fixup_redirectors([src_folder])
            fixed = True
        except Exception:
            fixed = False
    elif hasattr(tools, "fixup_referencers"):
        try:
            reg = unreal.AssetRegistryHelpers.get_asset_registry()
            assets = reg.get_assets_by_path(src_folder, recursive=False)
            redirs = [a.get_asset() for a in assets if str(a.asset_class_path.asset_name) == "ObjectRedirector"]
            if redirs:
                tools.fixup_referencers(redirs)
            fixed = True
        except Exception:
            fixed = False
    return {"from": src, "to": dst, "moved": True, "redirectorsFixed": fixed}


def to_json_value(val, depth=0):
    if val is None or isinstance(val, (bool, int, float, str)):
        return val
    if depth > 4:
        return str(val)
    if isinstance(val, (unreal.Name, unreal.Text)):
        return str(val)
    if isinstance(val, unreal.Object):
        try:
            return val.get_path_name()
        except Exception:
            return str(val)
    if isinstance(val, (list, tuple, unreal.Array)):
        return [to_json_value(x, depth + 1) for x in val]
    if isinstance(val, (dict, unreal.Map)):
        return {str(k): to_json_value(v, depth + 1) for k, v in val.items()}
    if isinstance(val, unreal.StructBase):
        try:
            return val.export_text()
        except Exception:
            return str(val)
    return str(val)


def op_props(req):
    pkg = req["path"]
    keys = req.get("keys") or []
    asset = unreal.EditorAssetLibrary.load_asset(pkg)
    if asset is None:
        raise RuntimeError("asset not found: " + pkg)
    is_bp = isinstance(asset, unreal.Blueprint)
    target = asset
    if is_bp:
        gen = asset.generated_class()
        if gen is not None:
            cdo = unreal.get_default_object(gen)
            if cdo is not None:
                target = cdo
    props = {}
    if keys:
        for k in keys:
            props[k] = to_json_value(target.get_editor_property(k))
    else:
        for name in sorted(dir(target)):
            if name.startswith("_"):
                continue
            try:
                attr = getattr(target, name)
                if callable(attr):
                    continue
            except Exception:
                continue
            try:
                val = target.get_editor_property(name)
                props[name] = to_json_value(val)
            except Exception:
                pass
    return {
        "path": pkg,
        "assetClass": asset.get_class().get_name(),
        "class": target.get_class().get_name(),
        "isBlueprint": is_bp,
        "properties": props,
    }


def resolve_class(name):
    if not name:
        return None
    if name.startswith("/"):
        cls = unreal.load_class(None, name)
        if cls is not None:
            return cls
        asset = unreal.EditorAssetLibrary.load_asset(name)
        if isinstance(asset, unreal.Blueprint):
            return asset.generated_class()
        if isinstance(asset, unreal.Class):
            return asset
    attr = getattr(unreal, name, None)
    if attr is not None:
        try:
            if hasattr(attr, "static_class"):
                return attr.static_class()
        except Exception:
            pass
    for prefix in ("/Script/Engine.", "/Script/CoreUObject."):
        cls = unreal.load_class(None, prefix + name)
        if cls is not None:
            return cls
    raise RuntimeError("could not resolve Unreal class: " + name)


def coerce_value(target, key, val):
    try:
        cur = target.get_editor_property(key)
    except Exception:
        cur = None
    if isinstance(val, dict) and isinstance(cur, unreal.StructBase):
        for sk, sv in val.items():
            cur.set_editor_property(sk, coerce_value(cur, sk, sv))
        return cur
    if isinstance(val, str) and val.startswith("/") and (cur is None or isinstance(cur, unreal.Object)):
        loaded = unreal.EditorAssetLibrary.load_asset(val)
        if loaded is not None:
            return loaded
    if isinstance(cur, bool) and not isinstance(val, bool):
        return bool(val)
    if isinstance(cur, int) and not isinstance(cur, bool) and isinstance(val, float):
        return int(val)
    if isinstance(cur, float) and isinstance(val, int) and not isinstance(val, bool):
        return float(val)
    return val


def op_new(req):
    class_name = req["className"]
    dst = req["path"]
    parent_name = req.get("parent") or ""
    set_map = dict(req.get("set") or {})
    if unreal.EditorAssetLibrary.does_asset_exist(dst):
        raise RuntimeError("asset already exists: " + dst)
    pkg_path, asset_name = dst.rsplit("/", 1)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    lower = class_name.lower()
    asset = None
    is_world = lower in ("world", "map", "level")
    if is_world:
        les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        if not les.new_level(dst):
            raise RuntimeError("failed to create map: " + dst)
        asset = unreal.EditorAssetLibrary.load_asset(dst)
    elif lower == "blueprint":
        parent = parent_name or str(set_map.pop("ParentClass", "") or "Actor")
        parent_cls = resolve_class(parent)
        factory = unreal.BlueprintFactory()
        factory.set_editor_property("parent_class", parent_cls)
        asset = tools.create_asset(asset_name, pkg_path, unreal.Blueprint, factory)
    elif lower == "dataasset" or (not parent_name and lower.endswith("dataasset")):
        da_name = parent_name or str(set_map.pop("DataAssetClass", "") or (class_name if lower != "dataasset" else "DataAsset"))
        da_cls = resolve_class(da_name)
        factory = unreal.DataAssetFactory()
        factory.set_editor_property("data_asset_class", da_cls)
        asset = tools.create_asset(asset_name, pkg_path, da_cls, factory)
    else:
        cls = resolve_class(class_name)
        factory = None
        for fname in (class_name + "Factory", class_name + "FactoryNew"):
            fcls = getattr(unreal, fname, None)
            if fcls is not None:
                factory = fcls()
                break
        if factory is None and cls is not None:
            try:
                if cls.is_child_of(unreal.DataAsset.static_class()):
                    factory = unreal.DataAssetFactory()
                    factory.set_editor_property("data_asset_class", cls)
            except Exception:
                pass
        asset = tools.create_asset(asset_name, pkg_path, cls, factory)
    if asset is None:
        raise RuntimeError("failed to create asset " + dst + " of class " + class_name)
    applied = []
    if set_map:
        target = asset
        if isinstance(asset, unreal.Blueprint):
            gen = asset.generated_class()
            if gen is not None:
                cdo = unreal.get_default_object(gen)
                if cdo is not None:
                    target = cdo
        for k, v in set_map.items():
            target.set_editor_property(k, coerce_value(target, k, v))
            applied.append(k)
    if isinstance(asset, unreal.Blueprint) and hasattr(unreal, "BlueprintEditorLibrary"):
        unreal.BlueprintEditorLibrary.compile_blueprint(asset)
    if is_world:
        les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        saved = bool(les.save_current_level())
    else:
        saved = bool(unreal.EditorAssetLibrary.save_asset(dst, only_if_is_dirty=False))
    return {
        "path": dst,
        "class": asset.get_class().get_name(),
        "set": applied,
        "saved": saved,
    }


def op_scan(req):
    paths = list(req.get("paths") or [])
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    if paths:
        reg.scan_paths_synchronous(paths, True)
    return {"scanned": paths}


OPS = {
    "deps": op_deps,
    "migrate": op_migrate,
    "move": op_move,
    "props": op_props,
    "new": op_new,
    "scan": op_scan,
}


def main():
    req_path = sys.argv[1] if len(sys.argv) >= 3 else os.environ.get("AMETHYST_ASSET_REQ", "")
    res_path = sys.argv[2] if len(sys.argv) >= 3 else os.environ.get("AMETHYST_ASSET_RES", "")
    if not req_path or not res_path:
        raise RuntimeError("missing AMETHYST_ASSET_REQ or AMETHYST_ASSET_RES")
    try:
        with open(req_path, "r", encoding="utf-8") as fh:
            req = json.load(fh)
        op = req.get("op", "")
        if op not in OPS:
            raise RuntimeError("unknown asset operation: " + str(op))
        data = OPS[op](req)
        write_result(res_path, {"ok": True, "data": data})
    except Exception as exc:
        write_result(res_path, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
