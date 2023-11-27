# VSCode Cppcheck

## Overview

VSCode Cppcheck is a Visual Studio Code extension that integrates the Cppcheck static analysis tool into VSCode. This extension enables developers to run Cppcheck directly within VSCode, allowing for a seamless and integrated coding experience.

## Features

- Run Cppcheck: Easily initiate Cppcheck analyses directly from VSCode.
- Visualize Errors: View and navigate through errors detected by Cppcheck.
- Link Errors to Source: Directly jump to the exact location of detected errors within your code.

## Installation

- Download the .vsix file from the Releases section.
- In VSCode, open the Command Palette (Ctrl+Shift+P), select "Install from VSIX", and choose the downloaded file.

## Usage

- Ensure you have at least one Cppcheck project file (*.cppcheck). This can be created using the Cppcheck GUI.
    - Each *.cppcheck file will be treated as a unique error source.
    - This is primarily for supporting multi-root workspaces.
- Optionally, customize the Cppcheck command path using cppcheck.cppcheckPath (defaults to `cppcheck` on `PATH`).
- To run Cppcheck, select the extension in the sidebar and click the run button located alongsizd the *.cppcheck file.
- A progress notification will appear during the analysis. Once complete, the tree view will display detected errors.
- Click on errors to navigate directly to the relevant location in your code.
    - Some errors may have multiple locations. Expand these errors to see their locations.

## Roadmap

The future of VSCode Cppcheck is exciting, and we have several enhancements in the pipeline:

- [x] **Customizable Cppcheck Command Execution**: Introduce settings to give users more control over how the Cppcheck command is executed.
- [ ] **Error View Options**: Add a toggle to switch between a tree and list view for displaying errors.
- [ ] **Inline Suppressions**: Implement functionality to insert inline suppressions directly into the code.
- [ ] **Welcome Screen for Missing Project File**: Create a welcome screen that guides users when a project file is missing.
- [ ] **Cppcheck Project File Generator/Configurator**: Explore the possibility of integrating a project file generator/configurator to eliminate the dependency on the Cppcheck GUI. This feature is under consideration as it requires understanding and implementing the Cppcheck project file specification.
- [ ] **Support Additional Project File Types**: The *.cppcheck file is primarily used by the Cppcheck GUI. The Cppcheck CLI also accepts a variety of other formats in the `--project` argument. Consider implementing direct support for these formats, however, for now users should be able to specify one of those formats within a *.cppcheck file.

## Contributing

Contributions are welcome!

## License

This project is licensed under the MIT license.