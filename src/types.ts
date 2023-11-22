type TagDir = {
    name: "string"
}

type TagDirList = {
    dir?: TagDir | TagDir[]
}

// TODO: figure out suppressions and other key settings!
// Basic description found at: https://github.com/danmar/cppcheck/blob/main/gui/projectfile.txt
// Consider using a different, less opinionated, xml parser to remain true to file structure
export type CppcheckProjectFile = {[key: string]: any} & {
    root?: TagDir
    builddir?: string
    platform?: string
    paths?: TagDirList
    includedir?: TagDirList
    exclude?: TagDirList
    libraries?: {
        library?: string | string[]
    }
    addons?: {
        addon?: string | string[]
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
