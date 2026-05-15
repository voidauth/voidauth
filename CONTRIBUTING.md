# Contributing to VoidAuth

Contributions to VoidAuth are welcome! Lets get started.

## Support

Issues, Suggestions, and Feature Requests should be added as [Issues](https://github.com/voidauth/voidauth/issues) of the appropriate type. For Help and Support, Q&A, or anything else; open a [Discussion](https://github.com/orgs/voidauth/discussions).

## Documentation Updates

Documentation, especially app setup guides, are largely community driven and so contribution is highly encouraged. If you have VoidAuth OIDC setup with an app that is not already listed in the [OIDC App Guides](https://voidauth.app/#/OIDC-Guides) then please consider contributing a guide. When writing documentation follow the existing style of the page and when finished open a Pull Request for review.

Documentation updates should made in the `docs/` directory and a Pull Request opened for approval of the changes.

## Development Environment

VoidAuth consists of a Frontend `./frontend` and Backend `./server`. The frontend is served through the backend, and when developing the frontend is automatically rebuilt when changes are detected. To see those frontend changes on the web UI the page must be refreshed. Lets get set up!

### Prerequisites

- An IDE supporting Javascript/Typescript development, such as VSCode
- If using VSCode, the `i18n Ally` extension is recommended but not required
- Node.js >= 22.17.0 installed on your development machine
- Docker Compose, or different way to run your own local Postgres DB

### Starting the Project

All paths and actions are in the project root directory unless otherwise specified.

1. Run `npm install` in your terminal to install backend dependencies.
2. In the `./frontend` directory, run `npm install` in your terminal to install frontend dependencies.
3. Configure a `.env` file using the `.example.env` file as a template. All variables in `.example.env` are required in `.env`, though you can add additional variables as well.
4. Run `docker compose up -d voidauth-db` or equivalent in your terminal to start the VoidAuth database locally.
5. Run `npm start` to build and start the project.
6. Visit `localhost:3000` or your configured `APP_URL` to view the VoidAuth web UI.

## Contribution Standards

All code contributions are expected to be thoroughly tested and defect-free. Changes must also pass Typescript checking and linting, which are checked automatically for every Pull Request. You can manually run Typescript and linting locally by running `npx tsc && npx eslint ./`, they should run automatically when committing code.

Frontend changes should not include user-facing hardcoded strings. These should be localized and placed in the `./frontend/public/i18n/en-US.json` file, use the VSCode `i18n Ally` extension or the translation tooling of your choice to make this easier. Translations to other languages than `en-US` are not initially required.

Pull Requests should follow the template that appears when they are opened. Make sure to list every feature and fix contained in the Pull Request, screenshots should be attached if any changes to the frontend UI were made.
