import * as childProcess from "node:child_process";
import * as os from "node:os";
import * as vscode from "vscode";

import * as xml2js from "xml2js";

import { CppcheckProvider } from "./cppcheck_provider";
import { CppcheckError } from "./types";

function ensure_array<T>(value: T | T[]): T[]
{
    if (Array.isArray(value))
    {
        return value;
    }
    return [value];
}

const DECORATION = vscode.window.createTextEditorDecorationType(
    {
        backgroundColor: "red",
    }
)

export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel("cppcheck");

    const cppcheckErrorProvider = new CppcheckProvider();
    vscode.window.registerTreeDataProvider("cppcheck", cppcheckErrorProvider);

    // Run Command
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "cppcheck.run",
            () => {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Running Cppcheck [See Output](command:cppcheck.showOutput)",
                    cancellable: false,
                }, (_progress, _token) => {
                    return new Promise<void>((resolve, reject) => {
                        let result = "";
                        const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.path;
                        const config = vscode.workspace.getConfiguration("cppcheck");
                        const cpus = os.availableParallelism();
                        const child = childProcess.spawn(
                            config.get("cppcheckPath") as string,
                            [
                                "--inline-suppr",
                                "--project=project.cppcheck",
                                "--enable=all",
                                "--xml",
                                "-j",
                                `${cpus}`,
                            ],
                            {
                                cwd: workspaceFolder
                            }
                        );

                        child.stdout.on("data", (chunk: Buffer) => {
                            output.append(chunk.toString());
                        });

                        child.stderr.on("data", (chunk: Buffer) => {
                            result += chunk.toString();
                        });

                        child.on("close", async (code: number) => {
                            output.append("DONE!");
                            const resultJson = await xml2js.parseStringPromise(result, {
                                explicitRoot: false,
                                explicitArray: false,
                                mergeAttrs: true,
                            });
                            if (!resultJson) {
                                return reject();
                            }
                            const errors: CppcheckError[] = resultJson.errors.error || [];
                            errors.forEach(error => {
                                error.location = ensure_array(error.location);
                            })
                            cppcheckErrorProvider.loadErrors(errors);
                            resolve();
                        });

                    });
                });
            }
        )
    );

    // Open File Command
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

    // Show Output Command
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "cppcheck.showOutput",
            () => {
                output.show()
            }
        )
    )

}

export function deactivate(): void {}
