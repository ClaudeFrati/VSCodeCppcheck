import * as vscode from "vscode";

type Check = (
    "all" |
    "warning" |
    "style" |
    "performance" |
    "portability" |
    "information" |
    "unusedFunction" |
    "missingInclude"
);

type Std = (
    "c89" |
    "c99" |
    "c11" |
    "c++03" |
    "c++11" |
    "c++17" |
    "c++20"
);

type Args = {
    sources: string[]
    buildDir: string
    checkLevel: "" | "normal" | "exhaustive"
    enable: Check[]
    fileFilter: string[]
    exclude: string[]
    include: string[]
    inconclusive: boolean
    inlineSuppr: boolean
    jobs: number
    library: string[]
    maxCtuDepth: number
    preprocessorDefines: string[]
    preprocessorUndefines: string[]
    project: string
    std: Std
    suppress: string[]
}

type Config = {
    cppcheckPath: string
    runOnSave: boolean
    runOnSaveSingle: boolean
    args: Args
}

export async function getConfig(scope?: vscode.Uri | vscode.WorkspaceFolder | vscode.TextDocument): Promise<Config> {
    const config = vscode.workspace.getConfiguration("cppcheck", scope);

    let json: Args | undefined = await getCppcheckJson(scope);

    function getArg<T extends keyof Args>(arg: T): Args[T] {
        return json?.[arg] ?? config.get(`args.${arg}`)!;
    } 

    return {
        cppcheckPath: config.get("cppcheckPath")!,
        runOnSave: config.get("runOnSave")!,
        runOnSaveSingle: config.get("runOnSaveSingle")!,
        args: {
            sources: getArg("sources"),
            buildDir: getArg("buildDir"),
            checkLevel: getArg("checkLevel"),
            enable: getArg("enable"),
            fileFilter: getArg("fileFilter"),
            exclude: getArg("exclude"),
            include: getArg("include"),
            inconclusive: getArg("inconclusive"),
            inlineSuppr: getArg("inlineSuppr"),
            jobs: getArg("jobs"),
            library: getArg("library"),
            maxCtuDepth: getArg("maxCtuDepth"),
            preprocessorDefines: getArg("preprocessorDefines"),
            preprocessorUndefines: getArg("preprocessorUndefines"),
            project: getArg("project"),
            std: getArg("std"),
            suppress: getArg("suppress"),
        }
    }
}

async function getCppcheckJson(scope: vscode.Uri | vscode.WorkspaceFolder | vscode.TextDocument | undefined) {
    const uri = scope instanceof vscode.Uri ? scope : scope?.uri;
    let json: Args | undefined;
    if (uri) {
        const root = vscode.workspace.getWorkspaceFolder(uri);
        if (root) {
            const jsonUri = vscode.Uri.joinPath(root.uri, ".vscode", "cppcheck.json");
            try {
                const jsonBuffer = await vscode.workspace.fs.readFile(jsonUri);
                json = JSON.parse(jsonBuffer.toString());
            }
            catch (err) {
                if (!(err instanceof vscode.FileSystemError)) {
                    throw err;
                }
            }
        }
    }
    return json;
}