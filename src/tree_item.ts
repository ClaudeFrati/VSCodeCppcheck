import * as vscode from "vscode";

import { getIcon } from "./icons";
import { SeverityIcons } from "./severity";
import { CppcheckError, CppcheckErrorLocation, CppcheckProjectFile } from "./types";

export class CppcheckProjectFileItem extends vscode.TreeItem {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly projectFile: CppcheckProjectFile,
    ) {
        super(uri, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = "projectfile";
        this.iconPath = vscode.ThemeIcon.File;
    }
}

export class CppcheckFileItem extends vscode.TreeItem {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly projectFileUri: vscode.Uri,
    ) {
        super(uri, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = vscode.ThemeIcon.File;
    }
}

export class CppcheckErrorItem extends vscode.TreeItem {
    constructor(
        public readonly error: CppcheckError,
        public readonly fileUri: vscode.Uri,
    ) {
        super(
            error.msg,
            error.location.length > 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        if (error.location.length == 1) {
            this.command = {
                title: "",
                command: "cppcheck.openFile",
                arguments: [
                    fileUri,
                    Number(error.location[0].line) - 1,
                    Number(error.location[0].column) - 1,
                    this,
                ]
            };
        }
        this.iconPath = SeverityIcons[error.severity];
    }
}

export class CppcheckLocationItem extends vscode.TreeItem {
    constructor(
        location: CppcheckErrorLocation,
        fileUri: vscode.Uri,
    ) {
        super(location.info ?? "Location");
        this.command = {
            title: "",
            command: "cppcheck.openFile",
            arguments: [
                fileUri,
                Number(location.line) - 1,
                Number(location.column) - 1,
                this,
            ]
        };
        this.iconPath = {
            "dark": getIcon("location", "dark"),
            "light": getIcon("location", "light"),
        };
    }
}

export type CppcheckItem = CppcheckProjectFileItem | CppcheckFileItem | CppcheckErrorItem | CppcheckLocationItem;

