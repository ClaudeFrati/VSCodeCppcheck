import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import { promisify } from "node:util";
import * as vscode from "vscode";
import * as xml2js from "xml2js";

import { CppcheckTreeDataProvider } from "./tree_data_provider";
import { CppcheckProjectFileItem } from "./tree_item";
import { CppcheckError, CppcheckProjectFile } from "./types";
import { ensureArray } from "./utils";

const readFilePromise = promisify(fs.readFile);


export class CppcheckExtension
{
    readonly #decoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor("cppcheck.location"),
        overviewRulerColor: new vscode.ThemeColor("cppcheck.location"),
    });

    readonly #context: vscode.ExtensionContext;
    readonly #output: vscode.OutputChannel;
    readonly #treeDataProvider: CppcheckTreeDataProvider;

    #projectFiles: {[key: string]: CppcheckProjectFile} = {};

    constructor(
        context: vscode.ExtensionContext
    )
    {
        this.#context = context;
        this.#output = vscode.window.createOutputChannel("Cppcheck");
        this.#treeDataProvider = new CppcheckTreeDataProvider();
    }

    async activate() {
        vscode.window.registerTreeDataProvider("cppcheck", this.#treeDataProvider);

        this.#registerRunCommand();

        this.#registerOpenFileCommand();

        this.#registerShowOutputCommand();

        this.#registerReloadCommand();

        await this.#registerProjectFileWatcher();

        await this.#collectProjectFiles();
    }

    async deactivate() {}

    async #registerProjectFileWatcher() {
        var fsWatcher = vscode.workspace.createFileSystemWatcher("**/*.cppcheck", false, false, false);
        this.#context.subscriptions.push(fsWatcher);

        fsWatcher.onDidCreate((uri) => {
            this.#projectFiles[String(uri)] = this.#loadProjectFile(uri);
        });

        fsWatcher.onDidChange((uri) => {
            this.#projectFiles[String(uri)] = this.#loadProjectFile(uri);
        });

        fsWatcher.onDidDelete((file) => {
            delete this.#projectFiles[String(file)];
        });
    }

    #registerRunCommand() {
        this.#context.subscriptions.push(
            vscode.commands.registerCommand("cppcheck.run",
                (projectFile?: CppcheckProjectFileItem) => this.#runCppcheck(projectFile?.uri)
            )
        );
    }

    async #runCppcheck(projectFile?: vscode.Uri) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Running Cppcheck [View Output](command:cppcheck.showOutput)",
            cancellable: true,
        }, async (_progress, cancellationToken) => {
            try {
                await this.#executeCppcheck(projectFile, cancellationToken);
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

    async #executeCppcheck(projectFileUri_?: vscode.Uri, cancellationToken?: vscode.CancellationToken): Promise<void> {
        await new Promise<void>(async (resolve, reject) => {
            const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.path;

            let result = "";
            const config = vscode.workspace.getConfiguration("cppcheck");

            const cmd = config.get("cppcheckPath") as string;
            const enableItems = config.get("args.enable") as string[];
            const inconclusive = config.get("args.inconclusive") as boolean;
            const inlineSuppr = config.get("args.inlineSuppr") as boolean;
            const std = config.get("args.std") as string;
            const jobs = config.get("args.jobs") as number;

            const projectFileUri = projectFileUri_ ?? vscode.Uri.parse(Object.keys(this.#projectFiles)[0]);

            const args = [
                `--project=${projectFileUri.path}`,
                "--xml",
            ];

            if (enableItems.length > 0) {
                args.push(`--enable=${enableItems.join(",")}`);
            }

            if (inconclusive) {
                args.push("--inconclusive");
            }

            if (inlineSuppr) {
                args.push("--inline-suppr");
            }

            if (std.length > 0) {
                args.push(`--std=${std}`);
            }

            args.push("-j")
            if (jobs <= 0) {
                const cpus = os.availableParallelism();
                args.push(`${cpus}`);
            }
            else {
                args.push(`${jobs}`);
            }

            const cpus = os.availableParallelism();
            const child = childProcess.spawn(
                cmd, args, {
                    cwd: workspaceFolder,
                }
            );

            cancellationToken?.onCancellationRequested(() => {
                child.kill();
            });

            child.on("error", reject);
            child.stdout.on("data", (chunk: Buffer) => this.#output.append(chunk.toString()));
            child.stderr.on("data", (chunk: Buffer) => result += chunk.toString());
            child.on("close", (code: number) => {
                this.#output.append("DONE!");
                try {
                    this.#processCppcheckResults(code, projectFileUri, result, this.#treeDataProvider);
                    resolve();
                }
                catch {
                    reject();
                }
            });
        });
    }
    
    async #processCppcheckResults(
        _code: number,
        projectFileUri: vscode.Uri,
        result: string,
        cppcheckProvider: CppcheckTreeDataProvider,
    ) {
        var resultJson = await xml2js.parseStringPromise(result, {
            explicitRoot: false,
            explicitArray: false,
            mergeAttrs: true,
        });

        const errors: CppcheckError[] = resultJson?.errors?.error ?? [];
        errors.forEach(error => {
            error.location = ensureArray(error.location);
        });

        cppcheckProvider.loadErrors(projectFileUri, errors);
    }

    #registerOpenFileCommand() {
        this.#context.subscriptions.push(
            vscode.commands.registerCommand(
                "cppcheck.openFile",
                async (file: vscode.Uri, line: number = 0, column: number = 0, item?: vscode.TreeItem) => {
                    const doc = await vscode.workspace.openTextDocument(file);
                    const editor = await vscode.window.showTextDocument(doc);
                    const position = new vscode.Position(line, column);
                    editor.selections = [new vscode.Selection(position, position)];
                    editor.revealRange(new vscode.Range(position, position));

                    editor.setDecorations(this.#decoration, [
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

    #registerShowOutputCommand() {
        this.#context.subscriptions.push(
            vscode.commands.registerCommand(
                "cppcheck.showOutput",
                () => { this.#output.show() }
            )
        );
    }

    #registerReloadCommand() {
        this.#context.subscriptions.push(
            vscode.commands.registerCommand(
                "cppcheck.reload",
                () => { this.#collectProjectFiles(); }
            )
        );
    }

    async #collectProjectFiles() {
        this.#projectFiles = {};
        var uris = await vscode.workspace.findFiles("**/*.cppcheck");
        for (let uri of uris) {
            var projectFile = await this.#loadProjectFile(uri);
            this.#projectFiles[String(uri)] = projectFile;
        }

        this.#treeDataProvider.loadProjectFiles(this.#projectFiles);
    }

    async #loadProjectFile(
        uri: vscode.Uri,
    ): Promise<CppcheckProjectFile>
    {
        var projectFileXml = (await readFilePromise(uri.path)).toString();

        var projectFile : CppcheckProjectFile = await xml2js.parseStringPromise(projectFileXml, {
            explicitRoot: false,
            explicitArray: false,
            mergeAttrs: true,
        });
        
        projectFile.$uri = uri;
        return projectFile;
    }

}






