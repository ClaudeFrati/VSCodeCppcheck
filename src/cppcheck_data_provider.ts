import * as path from "node:path";
import * as vscode from "vscode";
import {
    CppcheckErrorItem,
    CppcheckFileItem,
    CppcheckItem,
    CppcheckLocationItem
} from "./cppcheck_tree_item";
import { SeverityNumber } from "./severity";
import { CppcheckError } from "./types";


export class CppcheckDataProvider implements vscode.TreeDataProvider<CppcheckItem>
{
    #errors: CppcheckError[] = [];

    #onDidChangeTreeData = new vscode.EventEmitter<CppcheckItem | undefined | null | void>();
    onDidChangeTreeData: vscode.Event<void | CppcheckItem | CppcheckItem[] | null | undefined> = this.#onDidChangeTreeData.event;

    getAbsPath(file: string): string
    {
        var root = path.join(vscode.workspace.workspaceFolders![0].uri.path, "src");
        return path.join(root, file);
    }

    loadErrors(errors: CppcheckError[]): void
    {
        this.#errors = errors;
        this.#onDidChangeTreeData.fire();
    }

    getTreeItem(element: CppcheckItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: CppcheckItem | undefined): vscode.ProviderResult<CppcheckItem[]> {
        if (element === undefined)
        {
            var files: string[] = [];
            for (let error of this.#errors) {
                error.location.map(l => l.file).forEach(file => {
                    if (!files.includes(file)) { files.push(file); }
                });
            }
            files = files.sort();
            var fileItems = files.map(file => new CppcheckFileItem(this, file));
            return Promise.resolve(fileItems);
        }
        else if (element instanceof CppcheckFileItem)
        {
            var errors = this.#errors.filter(error => {
                const files = error.location.map(l => l.file);
                return files.includes(element.filename);
            });
            errors = errors.sort((a, b) => {
                if (a.severity == b.severity) {
                    if (a.msg > b.msg) { return +1; }
                    if (a.msg < b.msg) { return -1; }
                    return 0;
                }
                return SeverityNumber[b.severity] - SeverityNumber[a.severity];
            })
            var errorItems = errors.map(error => new CppcheckErrorItem(this, error));
            return Promise.resolve(errorItems);
        }
        else if (element instanceof CppcheckErrorItem && element.error.location.length > 1)
        {
            var locationItems = element.error.location.map(l => new CppcheckLocationItem(this, l));
            return Promise.resolve(locationItems);
        }
        else
        {
            return Promise.resolve([]);
        }
    }
}