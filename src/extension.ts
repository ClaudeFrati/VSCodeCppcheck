import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as vscode from "vscode";
import * as xml2js from "xml2js";

import path from "node:path";
import { CppcheckDataProvider } from "./cppcheck_data_provider";
import { CppcheckError, CppcheckProjectFile } from "./types";
import { ensure_array } from "./utils";

const DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: "red",
});

export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel("cppcheck");
    const cppcheckErrorProvider = new CppcheckDataProvider();
    vscode.window.registerTreeDataProvider("cppcheck", cppcheckErrorProvider);

    registerRunCppcheckCommand(context, output, cppcheckErrorProvider);

    registerOpenFileCommand(context);

    registerShowOutputCommand(context, output);
}

function registerRunCppcheckCommand(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    cppcheckProvider: CppcheckDataProvider,
) {
    context.subscriptions.push(
        vscode.commands.registerCommand("cppcheck.run", () => runCppcheck(output, cppcheckProvider))
    );
}

function runCppcheck(
    output: vscode.OutputChannel,
    cppcheckProvider: CppcheckDataProvider,
) {
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Running Cppcheck [See Output](command:cppcheck.showOutput)",
        cancellable: false,
    }, (_progress, _token) => executeCppcheck(output, cppcheckProvider));
}

function executeCppcheck(
    output: vscode.OutputChannel,
    cppcheckProvider: CppcheckDataProvider,
): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.path;

        let result = "";
        const config = vscode.workspace.getConfiguration("cppcheck");
        const cmd = config.get("cppcheckPath") as string;
        const projectFilePath = config.get("projectFile") as string;
        const projectFile = await loadCppcheckProjectFile(workspaceFolder, projectFilePath);

        const cpus = os.availableParallelism();
        const child = childProcess.spawn(
            cmd,
            [
                "--inline-suppr",
                `--project=${projectFilePath}`,
                "--enable=all",
                "--xml",
                "-j", `${cpus}`,
            ],
            {
                cwd: workspaceFolder,
            }
        );

        child.stdout.on("data", (chunk: Buffer) => output.append(chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => result += chunk.toString());
        child.on("close", (code: number) => {
            output.append("DONE!");
            processCppcheckResults(code, projectFile, result, cppcheckProvider, resolve, reject)
        });
    });
}

async function loadCppcheckProjectFile(
    workspaceFolder: string,
    projectFilePath: string,
): Promise<CppcheckProjectFile>
{
    var projectFileXml = fs.readFileSync(path.join(workspaceFolder, projectFilePath));
    return await xml2js.parseStringPromise(projectFileXml, {
        explicitRoot: false,
        explicitArray: false,
        mergeAttrs: true,
    });
}

function processCppcheckResults(
    _code: number,
    projectFile: CppcheckProjectFile,
    result: string,
    cppcheckProvider: CppcheckDataProvider,
    resolve: () => void,
    reject: () => void,
) {
    xml2js.parseStringPromise(result, {
        explicitRoot: false,
        explicitArray: false,
        mergeAttrs: true,
    }).then(resultJson => {
        if (!resultJson) {
            return reject();
        }
        const errors: CppcheckError[] = resultJson.errors.error || [];
        errors.forEach(error => {
            error.location = ensure_array(error.location);
        });
        cppcheckProvider.loadErrors(projectFile, errors);
        resolve();
    });
}

function registerOpenFileCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "cppcheck.openFile",
            async (file: vscode.Uri, line: number = 0, column: number = 0, item?: vscode.TreeItem) => {
                const doc = await vscode.workspace.openTextDocument(file);
                const editor = await vscode.window.showTextDocument(doc);
                const position = new vscode.Position(line, column);
                editor.selections = [new vscode.Selection(position, position)];
                editor.revealRange(new vscode.Range(position, position));

                editor.setDecorations(DECORATION, [
                    new vscode.Range(position, new vscode.Position(position.line, position.character + 1))
                ]);

                if (item)
                {
                    vscode.commands.executeCommand("cppcheck.focus")
                }
            }
        )
    );
}

function registerShowOutputCommand(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "cppcheck.showOutput",
            () => {
                output.show()
            }
        )
    );
}

export function deactivate(): void {}