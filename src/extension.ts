import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import { promisify } from "node:util";
import * as vscode from "vscode";
import * as xml2js from "xml2js";

import path from "node:path";
import { CppcheckDataProvider } from "./cppcheck_data_provider";
import { CppcheckError, CppcheckProjectFile } from "./types";
import { ensure_array } from "./utils";

const readFilePromise = promisify(fs.readFile);

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

async function runCppcheck(
    output: vscode.OutputChannel,
    cppcheckProvider: CppcheckDataProvider,
) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Running Cppcheck [See Output](command:cppcheck.showOutput)",
        cancellable: false,
    }, async (_progress, _token) => {
        try {
            await executeCppcheck(output, cppcheckProvider);
        }
        catch(err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
            else {
                vscode.window.showErrorMessage(String(err));
            }
        }
    });
}

async function executeCppcheck(
    output: vscode.OutputChannel,
    cppcheckProvider: CppcheckDataProvider,
): Promise<void> {
    await new Promise<void>(async (resolve, reject) => {
        const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.path;

        let result = "";
        const config = vscode.workspace.getConfiguration("cppcheck");
        const cmd = config.get("cppcheckPath") as string;
        const projectFilePath = config.get("projectFile") as string;
        const projectFile = await loadCppcheckProjectFile(workspaceFolder, projectFilePath).catch(reject);
        if (!projectFile) {
            return;
        }

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

        child.on("error", reject);
        child.stdout.on("data", (chunk: Buffer) => output.append(chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => result += chunk.toString());
        child.on("close", (code: number) => {
            output.append("DONE!");
            try {
                processCppcheckResults(code, projectFile, result, cppcheckProvider);
                resolve();
            }
            catch {
                reject();
            }
        });
    });
}

async function loadCppcheckProjectFile(
    workspaceFolder: string,
    projectFilePath: string,
): Promise<CppcheckProjectFile>
{
    var projectFileXml = (
        await readFilePromise(path.join(workspaceFolder, projectFilePath))
    ).toString();

    return await xml2js.parseStringPromise(projectFileXml, {
        explicitRoot: false,
        explicitArray: false,
        mergeAttrs: true,
    });
}

async function processCppcheckResults(
    _code: number,
    projectFile: CppcheckProjectFile,
    result: string,
    cppcheckProvider: CppcheckDataProvider,
) {
    var resultJson = await xml2js.parseStringPromise(result, {
        explicitRoot: false,
        explicitArray: false,
        mergeAttrs: true,
    });

    const errors: CppcheckError[] = resultJson.errors.error || [];
    errors.forEach(error => {
        error.location = ensure_array(error.location);
    });

    cppcheckProvider.loadErrors(projectFile, errors);
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