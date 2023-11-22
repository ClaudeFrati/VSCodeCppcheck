export type CppcheckProjectFile = {[key: string]: any} & {
    root?: {
        name: string
    }
}

export type CppcheckErrorLocation = {
    file: string
    line: string
    column: string
    info?: string
};

export type CppcheckError = {
    id: string
    location: CppcheckErrorLocation[]
    msg: string
    severity: string
    verbose: string
};
