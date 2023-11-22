import * as childProcess from "node:child_process";
import * as os from "node:os";
import * as vscode from "vscode";
import * as xml2js from "xml2js";

import { CppcheckDataProvider } from "./cppcheck_data_provider";
import { CppcheckError } from "./types";
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
    return new Promise<void>((resolve, reject) => {
        let result = "";
        const config = vscode.workspace.getConfiguration("cppcheck");
        const cmd = config.get("cppcheckPath") as string;
        const projectFile = config.get("projectFile") as string;

        const cpus = os.availableParallelism();
        const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.path;
        const child = childProcess.spawn(
            cmd,
            [
                "--inline-suppr",
                `--project=${projectFile}`,
                "--enable=all",
                "--xml",
                "-j",
                `${cpus}`,
            ],
            {
                cwd: workspaceFolder,
            }
        );

        child.stdout.on("data", (chunk: Buffer) => output.append(chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => result += chunk.toString());
        child.on("close", (code: number) => processCppcheckResults(code, result, output, cppcheckProvider, resolve, reject));
    });
}

function processCppcheckResults(
    _code: number,
    result: string,
    output: vscode.OutputChannel,
    cppcheckProvider: CppcheckDataProvider,
    resolve: () => void,
    reject: () => void,
) {
    output.append("DONE!");
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
        cppcheckProvider.loadErrors(errors);
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