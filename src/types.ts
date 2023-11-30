export type CppcheckErrorLocation<L = string> = {
    file: L
    line: string
    column: string
    info?: string
};

export type CppcheckErrorSeverity =
    "information" |
    "style" |
    "portability" |
    "performance" |
    "warning" |
    "error";

export type CppcheckError<L = string> = {
    id: string
    location: CppcheckErrorLocation<L>[]
    msg: string
    severity: CppcheckErrorSeverity
    verbose: string
};
