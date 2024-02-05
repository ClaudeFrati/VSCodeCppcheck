import * as childProcess from "node:child_process";
import * as os from "node:os";
import * as vscode from "vscode";
import * as xml2js from "xml2js";
import * as glob from "glob";

import path from "node:path";
import { getConfig } from "./config";
import { CppcheckError, CppcheckErrorSeverity } from "./types";
import { ensureArray } from "./utils";

enum LanguageStatusState {
    IDLE,
    RUNNING,
}

export class CppcheckExtension
{
    readonly #context: vscode.ExtensionContext;
    readonly #output: vscode.OutputChannel;
    readonly #diagnosticCollection: vscode.DiagnosticCollection;
    readonly #languageStatusItem: vscode.LanguageStatusItem;

    #cppcheckProcess?: childProcess.ChildProcess;

    #cancellationTokenSource?: vscode.CancellationTokenSource;
    get #cancellationToken(): vscode.CancellationToken | undefined {
        return this.#cancellationTokenSource?.token;
    }

    constructor(
        context: vscode.ExtensionContext
    )
    {
        this.#context = context;

        const disposables = [
            this.#output = this.#createOutputChannel(),
            this.#diagnosticCollection = this.#createDiagnosticCollection(),
            this.#languageStatusItem = this.#createLanguageStatusItem(),
        ];

        disposables.forEach(
            disposable => context.subscriptions.push(disposable)
        );
    }

    activate() {
        this.#registerRunCommand();
        this.#registerStopCommand();
        this.#registerSourceFileWatcher();
    }

    deactivate() {}

    #createOutputChannel(): vscode.OutputChannel {
        return vscode.window.createOutputChannel("Cppcheck");
    }

    #createDiagnosticCollection(): vscode.DiagnosticCollection {
        return vscode.languages.createDiagnosticCollection("Cppcheck");
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

    #resetCancellationToken(): void {
        // Out with the old
        if (this.#cancellationTokenSource) {
            this.#cancellationTokenSource.cancel();
        }
        // In with the new
        this.#cancellationTokenSource = new vscode.CancellationTokenSource();
        this.#context.subscriptions.push(this.#cancellationTokenSource);
    }

    #registerSourceFileWatcher(): void {
        var fsWatcher = vscode.workspace.createFileSystemWatcher("**/*.{cpp,c,hpp,h,tpp,ipp}", false, false, false);
        this.#context.subscriptions.push(fsWatcher);

        fsWatcher.onDidCreate(async (uri) => {
            const config = await getConfig(uri);
            if (config.runOnSave) {
                this.#runCppcheck(uri);
            }
        });

        fsWatcher.onDidChange(async (uri) => {
            const config = await getConfig(uri);
            if (config.runOnSave) {
                this.#runCppcheck(uri);
            }
        });

        fsWatcher.onDidDelete(async (uri) => {
            const config = await getConfig(uri);
            if (config.runOnSave && !config.runOnSaveSingle) {
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                if (workspaceFolder) {
                    this.#runCppcheck(workspaceFolder.uri);
                }
            }
        });
    }

    #registerRunCommand() {
        this.#context.subscriptions.push(
            vscode.commands.registerCommand("cppcheck.run", (uri?: vscode.Uri) => this.#runCppcheck(uri))
        );
    }

    #registerStopCommand() {
        this.#context.subscriptions.push(
            vscode.commands.registerCommand("cppcheck.stop", () => this.#stopCppcheck())
        );
    }

    #setLanguageStatusState(state: LanguageStatusState): void {
        switch(state) {
            case LanguageStatusState.IDLE: {
                this.#languageStatusItem.busy = false;
                this.#languageStatusItem.detail = "Ready";
                this.#languageStatusItem.command = {
                    title: "Run",
                    command: "cppcheck.run",
                }
                break;
            }
            case LanguageStatusState.RUNNING: {
                this.#languageStatusItem.busy = true;
                this.#languageStatusItem.detail = "Running";
                this.#languageStatusItem.command = {
                    title: "Stop",
                    command: "cppcheck.stop",
                }
                break;
            }
        }
    }

    async #runCppcheck(sourceUri?: vscode.Uri): Promise<void> {
        this.#stopCppcheck();

        // Just a spin-lock
        while (this.#cppcheckProcess) {
            await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
        }

        this.#resetCancellationToken();
        this.#setLanguageStatusState(LanguageStatusState.RUNNING);

        if (!sourceUri) {
            let workspace : vscode.WorkspaceFolder | undefined;

            if (vscode.workspace.workspaceFolders?.length == 1) {
                workspace = vscode.workspace.workspaceFolders[0];
            }
            else {
                workspace = await vscode.window.showWorkspaceFolderPick();
            }

            if (workspace) {
                sourceUri = workspace.uri;
            }
        }

        if (sourceUri) {
            try {
                await this.#executeCppcheck(sourceUri);
            }
            catch(err) {
                if (err instanceof Error) {
                    vscode.window.showErrorMessage(err.message);
                }
                else {
                    vscode.window.showErrorMessage(String(err));
                }
            }
        }

        this.#setLanguageStatusState(LanguageStatusState.IDLE);
    }

    async #stopCppcheck(): Promise<void> {
        this.#cancellationTokenSource?.cancel();
    }

    async #executeCppcheck(sourceUri: vscode.Uri): Promise<void> {
        await new Promise<void>(async (resolve, reject) => {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri)!.uri;

            let result = "";
            const config = await getConfig(sourceUri);

            const args = ["--xml"];

            if (config.args.buildDir !== "") {
                args.push(`--cppcheck-build-dir=${config.args.buildDir}`);
            }

            if (config.args.checkLevel !== "") {
                args.push(`--check-level=${config.args.checkLevel}`);
            }

            if (config.args.enable.length > 0) {
                args.push(`--enable=${config.args.enable.join(",")}`);
            }

            for (let fileFilter of config.args.fileFilter) {
                args.push(`--file-filter=${fileFilter}`);
            }

            for (let ignore of config.args.exclude) {
                args.push(`-i`, `${ignore}`);
            }

            for (let include of config.args.include) {
                args.push(`-I`, `${include}`);
            }

            if (config.args.inconclusive) {
                args.push(`--inconclusive`);
            }

            if (config.args.inlineSuppr) {
                args.push(`--inline-suppr`);
            }

            if (config.args.jobs <= 0) {
                const cpus = os.availableParallelism();
                args.push(`-j`, `${cpus}`);
            }
            else {
                args.push(`-j`, `${config.args.jobs}`);
            }

            for (let library of config.args.library) {
                args.push(`--library=${library}`);
            }

            if (config.args.maxCtuDepth >= 0) {
                args.push(`--max-ctu-depth=${config.args.maxCtuDepth}`);
            }

            for (let define of config.args.preprocessorDefines) {
                args.push(`-D${define}`);
            }

            for (let undefine of config.args.preprocessorUndefines) {
                args.push(`-U${undefine}`);
            }

            if (config.args.std.length > 0) {
                args.push(`--std=${config.args.std}`);
            }

            for (let suppress of config.args.suppress) {
                args.push(`--suppress=${suppress}`);
            }

            if (
                config.runOnSaveSingle &&
                /\.(cpp|hpp|c|h|tpp|ipp)$/.test(sourceUri.fsPath)
            ) {
                args.push(sourceUri.fsPath);
            }
            else {
                const sources = await glob.glob(config.args.sources, {
                    cwd: workspaceFolder.fsPath
                });
                args.push(...sources);

                if (config.args.project !== "") {
                    args.push(`--project=${config.args.project}`);
                }
            }

            this.#output.appendLine(`${config.cppcheckPath} ${args.join(" ")}`);

            this.#cppcheckProcess = childProcess.spawn(
                config.cppcheckPath, args, {
                    cwd: workspaceFolder.fsPath,
                }
            );

            this.#cancellationToken?.onCancellationRequested(() => {
                this.#cppcheckProcess?.kill();
            });

            this.#cppcheckProcess.on("error", reject);
            this.#cppcheckProcess.stdout?.on("data", (chunk: Buffer) => this.#output.append(chunk.toString()));
            this.#cppcheckProcess.stderr?.on("data", (chunk: Buffer) => result += chunk.toString());
            this.#cppcheckProcess.on("close", (code: number) => {
                if (this.#cancellationToken?.isCancellationRequested) {
                    this.#output.appendLine("CANCELED!");
                    this.#cppcheckProcess = undefined;
                    return resolve();
                }

                this.#output.appendLine("DONE!");
                this.#processCppcheckResults(code, workspaceFolder, result).then(resolve).catch(reject).finally(() => {
                    this.#cppcheckProcess = undefined;
                });
            });
        });
    }

    async #processCppcheckResults(
        _code: number,
        rootUri: vscode.Uri,
        result: string,
    ) {
        var resultJson = await xml2js.parseStringPromise(result, {
            explicitRoot: false,
            explicitArray: false,
            mergeAttrs: true,
        });

        let rawErrors: CppcheckError<string>[] = resultJson?.errors?.error ?? [];
        if (!Array.isArray(rawErrors)) {
            rawErrors = [rawErrors];
        }
        const errors: CppcheckError<vscode.Uri>[] = this.#processRawCppcheckErrors(rawErrors, rootUri);

        const diagnostics = await this.#convertCppcheckErrorsToDiagnostics(errors);
        this.#diagnosticCollection.clear();
        this.#diagnosticCollection.set(diagnostics);
    }

    #processRawCppcheckErrors(rawErrors: CppcheckError<string>[], rootUri: vscode.Uri): CppcheckError<vscode.Uri>[] {
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
                        file: this.#getAbsUri(rootUri, String(l.file))
                    };
                })
            };
            return uriError;
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

    #getAbsUri(rootUri: vscode.Uri, file: string): vscode.Uri
    {
        if (path.isAbsolute(file)) {
            return vscode.Uri.parse(file);
        }
        return vscode.Uri.joinPath(rootUri, file);
    }

}






