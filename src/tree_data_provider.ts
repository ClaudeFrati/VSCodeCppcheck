import path from "node:path";
import * as vscode from "vscode";
import { SeverityNumber } from "./severity";
import {
    CppcheckErrorItem,
    CppcheckFileItem,
    CppcheckItem,
    CppcheckLocationItem,
    CppcheckProjectFileItem
} from "./tree_item";
import { CppcheckError, CppcheckProjectFile } from "./types";
import { arrayIncludesUri } from "./utils";


export class CppcheckTreeDataProvider implements vscode.TreeDataProvider<CppcheckItem>
{
    #projectFiles: {[key: string]: CppcheckProjectFile} = {}
    #errors: {[key: string]: CppcheckError[]} = {}

    #onDidChangeTreeData = new vscode.EventEmitter<CppcheckItem | CppcheckItem[] | undefined | null | void>();
    onDidChangeTreeData: vscode.Event<void | CppcheckItem | CppcheckItem[] | null | undefined> = this.#onDidChangeTreeData.event;

    loadProjectFiles(projectFiles: {[key: string]: CppcheckProjectFile}): void
    {
        this.#projectFiles = projectFiles;
        this.#onDidChangeTreeData.fire();
    }

    loadErrors(projectFileUri: vscode.Uri, errors: CppcheckError[]): void
    {
        this.#errors[String(projectFileUri)] = errors;
        this.#onDidChangeTreeData.fire();
    }

    getTreeItem(element: CppcheckItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: CppcheckItem | undefined): vscode.ProviderResult<CppcheckItem[]> {
        if (!element)
        {
            var projectFileItems = Object.entries(this.#projectFiles).map(([file, projectFile]) => {
                return new CppcheckProjectFileItem(vscode.Uri.parse(file), projectFile);
            });
            return Promise.resolve(projectFileItems);
        }
        if (element instanceof CppcheckProjectFileItem)
        {
            var uris: vscode.Uri[] = [];
            var projectFileUri = element.uri;
            for (let error of this.#errors[String(projectFileUri)] ?? []) {
                error.location
                .map(l => this.#getAbsUri(projectFileUri, l.file))
                .forEach(uri => {
                    if (!arrayIncludesUri(uris, uri)) {
                        uris.push(uri);
                    }
                });
            }
            uris = uris.sort();
            var fileItems = uris.map(uri => new CppcheckFileItem(uri, projectFileUri));
            return Promise.resolve(fileItems);
        }
        else if (element instanceof CppcheckFileItem)
        {
            var errors = this.#errors[String(element.projectFileUri)]?.filter(error => {
                const uris = error.location.map(l => this.#getAbsUri(element.projectFileUri, l.file));
                return arrayIncludesUri(uris, element.uri);
            }) ?? [];
            errors = errors.sort((a, b) => {
                if (a.severity == b.severity) {
                    if (a.msg > b.msg) { return +1; }
                    if (a.msg < b.msg) { return -1; }
                    return 0;
                }
                return SeverityNumber[b.severity] - SeverityNumber[a.severity];
            })
            var errorItems = errors.map(error => new CppcheckErrorItem(error, element.uri));
            return Promise.resolve(errorItems);
        }
        else if (element instanceof CppcheckErrorItem && element.error.location.length > 1)
        {
            var locationItems = element.error.location.map(location => new CppcheckLocationItem(location, element.fileUri));
            return Promise.resolve(locationItems);
        }
        else
        {
            return Promise.resolve([]);
        }
    }

    #getAbsUri(projectFileUri: vscode.Uri, file: string): vscode.Uri
    {
        var projectFile = this.#projectFiles[String(projectFileUri)];
        var root = projectFile.root?.name ?? "."
        if (path.isAbsolute(file)) {
            return vscode.Uri.parse(file);
        }
        var workspaceFolder = vscode.workspace.getWorkspaceFolder(projectFileUri)!;
        return vscode.Uri.joinPath(workspaceFolder.uri, root, file);
    }
}