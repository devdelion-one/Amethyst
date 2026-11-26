import type { Act } from '../base/acts.ts';

export const ACTIONS: Act[] = [
  {
    name: 'project add',
    tool: 'project_add',
    about: "Add a folder as an Amethyst project in a workspace so Amethyst tools (such as ue generate, ue build, ue editor, chat and git) can work in it. Without --create, the folder must already exist. While the user has \"chats answer other chats' permission asks\" off, adding a project waits for their OK in Amethyst's window, and folders containing an agent's settings or hooks are refused.",
    args: [
      { name: 'path', type: 'string', pos: true, about: 'The folder path (relative to the current folder, or absolute); the current folder by default' },
      { name: 'name', type: 'string', about: 'The project display name (defaults to the folder name)' },
      { name: 'workspace', type: 'string', about: 'The workspace name or id to add the project to' },
      { name: 'create', type: 'boolean', about: "Create the folder if it doesn't exist yet" },
      { name: 'timeout', type: 'number', about: "Seconds to wait for the user's OK in Amethyst, 300 by default, 0 for no limit" },
    ],
    route: 'POST /api/project/add',
    example: 'amethyst project add E:\\MyGame --workspace Games',
  },
];
