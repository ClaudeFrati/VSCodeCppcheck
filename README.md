# VSCode Cppcheck

VSCode Cppcheck is a Visual Studio Code extension that integrates the Cppcheck static analysis tool into VSCode. This extension enables developers to run Cppcheck directly within VSCode, allowing for a seamless and integrated coding experience.

## Features

- **Run Cppcheck**: Easily initiate Cppcheck analyses directly from VSCode. Either through the command `cppcheck.run` or through the `C++ Language Status Item` (visible when a C/C++ file is currently active).
- **Run On Save**: Optionally, run Cppcheck when a C/C++ file is saved.
    - For performance, it is strongly recommended to specify `config:cppcheck.buildDir` (or specify `<cppcheck-build-dir>` in `*.cppcheck` project file).
- **Visualize Errors**: View and navigate through errors detected by Cppcheck via the builtin `Problems` panel.
- **Link Errors to Source**: Directly jump to the exact location of detected errors within your code. Any additional locations provided by Cppcheck are also included with each error.
- **View Output**: View the output of the Cppcheck command in the `Cppcheck` output channel in the `Output` panel. This is useful for monitoring long executions and diagnosing configuration issues.


## Installation

- Download the .vsix file from the Releases section.
- In VSCode, open the Command Palette (Ctrl+Shift+P), select "Install from VSIX", and choose the downloaded file.

## Usage

- Ensure Cppcheck is available on host machine.
- Optionally, configure the Cppcheck command path using `config:cppcheck.cppcheckPath` (defaults to `cppcheck` on `PATH`).
- Configure how the Cppcheck command will be executed.
    - This can either be configured through:
        - VSCode's built in configurations (e.g. settings.json, workspace settings)
        - [.vscode/cppcheck.json](#cppcheckjson)
    - All major CLI arguments should be configurable excluding those which alter the output format.
    - *Note*: Many of these options are also configurable through the various project file formats supported by Cppcheck. It's possible to combine these options with a project file (through `config:cppcheck.args.project` / `--project`) in the same way this can be done through the CLI.

## cppcheck.json

If `.vscode/cppcheck.json` exists, any property defined here will override those configured in the settings.

This is the preferred choice when committing the configuration. All of the same CLI arguments configurable in settings are configurable here as well. A json schema is provided for this file which provides completion and validation.

## Roadmap

The future of VSCode Cppcheck is exciting, and we have several enhancements in the pipeline:

- [x] **Customizable Cppcheck Command Execution**: Introduce settings to give users more control over how the Cppcheck command is executed.
- [ ] **Inline Suppressions**: Implement functionality to insert inline suppressions directly into the code.
- [ ] **Initialize .vscode/cppcheck.json**: Add a command to aid in creating a `.vscode/cppcheck.json` file.

## Contributing

Contributions are welcome!

## License

This project is licensed under the MIT license.