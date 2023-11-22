import * as vscode from "vscode";
import { IconDef } from "./icons";
import { getIcon } from "./icons";

export const SeverityNumber: { [key: string]: number; } = {
    "information": 0,
    "style": 1,
    "portability": 2,
    "performance": 3,
    "warning": 4,
    "error": 5,
};

export const SeverityIcons: { [key: string]: string | vscode.Uri | vscode.ThemeIcon | IconDef; } = {
    "information": {
        "dark": getIcon("information", "dark"),
        "light": getIcon("information", "light"),
    },
    "style": {
        "dark": getIcon("style", "dark"),
        "light": getIcon("style", "light"),
    },
    "portability": {
        "dark": getIcon("portability", "dark"),
        "light": getIcon("portability", "light"),
    },
    "performance": {
        "dark": getIcon("performance", "dark"),
        "light": getIcon("performance", "light"),
    },
    "warning": {
        "dark": getIcon("warning", "dark"),
        "light": getIcon("warning", "light"),
    },
    "error": {
        "dark": getIcon("error", "dark"),
        "light": getIcon("error", "light"),
    }
};

