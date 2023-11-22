import * as vscode from "vscode";

import { SeverityIcons } from "./severity";
import { CppcheckError, CppcheckErrorLocation } from "./types";

import type { CppcheckDataProvider } from "./cppcheck_data_provider";
import { getIcon } from "./icons";


export class CppcheckLocationItem extends vscode.TreeItem {
    constructor(
        public readonly provider: CppcheckDataProvider,
        public readonly location: CppcheckErrorLocation
    ) {
        super(location.info ?? "Location");
        var file_path = vscode.Uri.file(provider.getAbsPath(location.file));
        this.command = {
            title: "",
            command: "cppcheck.openFile",
            arguments: [
                file_path,
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

export class CppcheckErrorItem extends vscode.TreeItem {
    constructor(
        public readonly provider: CppcheckDataProvider,
        public readonly error: CppcheckError
    ) {
        super(
            error.msg,
            error.location.length > 1 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        if (error.location.length == 1) {
            var file_path = vscode.Uri.file(provider.getAbsPath(error.location[0].file));
            this.command = {
                title: "",
                command: "cppcheck.openFile",
                arguments: [
                    file_path,
                    Number(error.location[0].line) - 1,
                    Number(error.location[0].column) - 1,
                    this,
                ]
            };
        }
        this.iconPath = SeverityIcons[error.severity];
    }
}

export class CppcheckFileItem extends vscode.TreeItem {
    constructor(
        public readonly provider: CppcheckDataProvider,
        public readonly filename: string
    ) {
        super(filename, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = vscode.ThemeIcon.File;
        this.resourceUri = vscode.Uri.file(provider.getAbsPath(filename));
    }
}

export type CppcheckItem = CppcheckFileItem | CppcheckErrorItem | CppcheckLocationItem;

