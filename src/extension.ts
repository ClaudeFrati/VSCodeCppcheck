import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import { promisify } from "node:util";
import * as vscode from "vscode";
import * as xml2js from "xml2js";

import path from "node:path";
import { CppcheckError, CppcheckErrorSeverity, CppcheckProjectFile } from "./types";
import { ensureArray } from "./utils";

const readFilePromise = promisify(fs.readFile);


export class CppcheckExtension
{
    readonly #context: vscode.ExtensionContext;
    readonly #output: vscode.OutputChannel;
    readonly #diagnosticCollection: vscode.DiagnosticCollection;
    readonly #languageStatusItem: vscode.LanguageStatusItem;

    #projectFiles: {[key: string]: CppcheckProjectFile} = {};

    constructor(
        context: vscode.ExtensionContext
    )
    {
        this.#context = context;
        [
            this.#output = vscode.window.createOutputChannel("Cppcheck"),
            this.#diagnosticCollection = vscode.languages.createDiagnosticCollection("Cppcheck"),
            this.#languageStatusItem = this.#createLanguageStatusItem()
        ].forEach(
            disposable => context.subscriptions.push(disposable)
        );
    }

    async activate() {
        this.#registerRunCommand();

        await this.#registerProjectFileWatcher();

        await this.#registerSourceFileWatcher();

        await this.#collectProjectFiles();
    }

    async deactivate() {}

    async #registerProjectFileWatcher(): Promise<void> {
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

    #createLanguageStatusItem(): vscode.LanguageStatusItem {
        var languageStatusItem = vscode.languages.createLanguageStatusItem("Cppcheck", {
            language: "cpp"
        });
        languageStatusItem.busy = false;
        languageStatusItem.name = "Cppcheck";
        languageStatusItem.command = {
            command: "cppcheck.run",
            title: "Run Now"
        }
        languageStatusItem.text = "C$(plus-plus-check)";
        languageStatusItem.detail = "Ready";
        return languageStatusItem;
    }

    async #registerSourceFileWatcher(): Promise<void> {
        var fsWatcher = vscode.workspace.createFileSystemWatcher("**/*.{cpp,c,hpp,h,tpp,ipp}", false, false, false);
        this.#context.subscriptions.push(fsWatcher);

        fsWatcher.onDidCreate((uri) => {
            this.#runCppcheck();
        });

        fsWatcher.onDidChange((uri) => {
            this.#runCppcheck();
        });

        fsWatcher.onDidDelete((file) => {
            this.#runCppcheck();
        });
    }

    #registerRunCommand() {
        this.#context.subscriptions.push(
            vscode.commands.registerCommand("cppcheck.run",
                (projectFile?: vscode.Uri) => this.#runCppcheck(projectFile)
            )
        );
    }

    async #runCppcheck(projectFile?: vscode.Uri): Promise<void> {
        this.#languageStatusItem.busy = true;

        try {
            await this.#executeCppcheck(projectFile);
        }
        catch(err) {
            if (err instanceof Error) {
                vscode.window.showErrorMessage(err.message);
            }
            else {
                vscode.window.showErrorMessage(String(err));
            }
        }

        this.#languageStatusItem.busy = false;
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
                    this.#processCppcheckResults(code, projectFileUri, result);
                    resolve();
                }
                catch {
                    reject();
                }
            });
        });
    }
    
    async #getLocationWordRange(uri: vscode.Uri, line: number, column: number): Promise<vscode.Range> {
        const document = await vscode.workspace.openTextDocument(uri);
        return (
            document.getWordRangeAtPosition(new vscode.Position(line, column)) ??
            new vscode.Range(
                new vscode.Position(line, column),
                new vscode.Position(line, column + 1)
            )
        );
    }

    async #convertCppcheckErrorsToDiagnostics(cppcheckErrors: CppcheckError<vscode.Uri>[]): Promise<[vscode.Uri, vscode.Diagnostic[]][]> {
        const diagnosticsByFile = new Map<vscode.Uri, vscode.Diagnostic[]>();

        await Promise.all(cppcheckErrors.map(async (error) => {
            if (error.location.length == 0) {
                return;
            }

            const primaryLocation = error.location[0];
            const line = Math.max(Number(primaryLocation.line) - 1, 0);
            const column = Math.max(Number(primaryLocation.column) - 1, 0);
            const range = await this.#getLocationWordRange(primaryLocation.file, line, column);
            const diagnostic = new vscode.Diagnostic(
                range,
                `${error.msg}`,
                this.#convertSeverity(error.severity)
            );

            diagnostic.source = 'Cppcheck';
            diagnostic.code = `${error.severity}, ${error.id}`;

            // Add related information for additional locations
            if (error.location.length > 1) {
                let relatedLocations = error.location;
                if (!relatedLocations[0].info) {
                    relatedLocations = relatedLocations.slice(1);
                }
                diagnostic.relatedInformation = await Promise.all(
                    relatedLocations.map(async loc => {
                        const line = Math.max(Number(loc.line) - 1, 0);
                        const column = Math.max(Number(loc.column) - 1, 0);
                        const locRange = await this.#getLocationWordRange(loc.file, line, column);

                        return new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(loc.file, locRange),
                            loc.info || 'Related location'
                        );
                    })
                );
            }

            if (!diagnosticsByFile.has(primaryLocation.file)) {
                diagnosticsByFile.set(primaryLocation.file, []);
            }

            diagnosticsByFile.get(primaryLocation.file)?.push(diagnostic);
        }));

        return [...diagnosticsByFile.entries()];
    }

    #convertSeverity(severity: CppcheckErrorSeverity): vscode.DiagnosticSeverity {
        switch (severity) {
            case 'information':
                return vscode.DiagnosticSeverity.Information;
            case "style":
            case "portability":
            case "performance":
            case 'warning':
                return vscode.DiagnosticSeverity.Warning;
            case 'error':
                return vscode.DiagnosticSeverity.Error;
            default:
                return vscode.DiagnosticSeverity.Hint;
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
    
    async #processCppcheckResults(
        _code: number,
        projectFileUri: vscode.Uri,
        result: string,
    ) {
        var resultJson = await xml2js.parseStringPromise(result, {
            explicitRoot: false,
            explicitArray: false,
            mergeAttrs: true,
        });

        const rawErrors: CppcheckError<string>[] = resultJson?.errors?.error ?? [];
        const errors: CppcheckError<vscode.Uri>[] = this.#processRawCppcheckErrors(rawErrors, projectFileUri);

        const diagnostics = await this.#convertCppcheckErrorsToDiagnostics(errors);
        this.#diagnosticCollection.clear();
        this.#diagnosticCollection.set(diagnostics);
    }

    #processRawCppcheckErrors(rawErrors: CppcheckError<string>[], projectFileUri: vscode.Uri): CppcheckError<vscode.Uri>[] {
        return rawErrors.map(error => {
            error.location = ensureArray(error.location);
            const uriError: CppcheckError<vscode.Uri> = {
                id: error.id,
                msg: error.msg,
                severity: error.severity,
                verbose: error.verbose,
                location: error.location.map(l => {
                    return {
                        column: l.column,
                        line: l.line,
                        info: l.info,
                        file: this.#getAbsUri(projectFileUri, String(l.file))
                    };
                })
            };
            return uriError;
        });
    }

    async #collectProjectFiles() {
        this.#projectFiles = {};
        var uris = await vscode.workspace.findFiles("**/*.cppcheck");
        for (let uri of uris) {
            var projectFile = await this.#loadProjectFile(uri);
            this.#projectFiles[String(uri)] = projectFile;
        }
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






