import { diffLines } from "diff";
import hljs from "highlight.js/lib/common";

export function normalize(content: string) {
    return content.replace(/\r\n/g, "\n");
}

export function compare(
    before: string | null | undefined,
    after: string | null | undefined,
) {
    const removed: number[] = [];
    const added: number[] = [];
    if (before == null && after != null) {
        const text = normalize(after);
        if (text) {
            const lines = text.replace(/\n$/, "").split("\n");
            for (let i = 0; i < lines.length; i++) added.push(i);
        }
        return { removed, added, limited: false };
    }
    if (before == null || after == null) {
        return { removed, added, limited: false };
    }
    const changes = diffLines(normalize(before), normalize(after), {
        timeout: 60,
        maxEditLength: 3000,
    });
    if (!changes) return { removed, added, limited: true };
    let oldLine = 0;
    let newLine = 0;
    for (const change of changes) {
        const count = change.count ?? 0;
        if (change.added) {
            for (let i = 0; i < count; i++) added.push(newLine++);
        } else if (change.removed) {
            for (let i = 0; i < count; i++) removed.push(oldLine++);
        } else {
            oldLine += count;
            newLine += count;
        }
    }
    return { removed, added, limited: false };
}

const languages: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cc: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    html: "xml",
    htm: "xml",
    xml: "xml",
    svg: "xml",
    vue: "xml",
    svelte: "xml",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    ini: "ini",
    toml: "ini",
    dockerfile: "dockerfile",
    makefile: "makefile",
};

export function languageFor(path: string) {
    const name = path.split("/").at(-1)?.toLowerCase() ?? "";
    return languages[name.split(".").at(-1) ?? ""] ?? "plaintext";
}

export function highlight(content: string, path: string) {
    const language = languageFor(path);
    if (content.length <= 160_000 && hljs.getLanguage(language)) {
        return hljs.highlight(content, { language, ignoreIllegals: true })
            .value;
    }
    return content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function formatDate(date: string, long = false) {
    return new Intl.DateTimeFormat(undefined, {
        month: long ? "long" : "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(date));
}
