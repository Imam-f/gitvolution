export interface DisplayLine {
    text: string;
    number: number | null;
    changed: boolean;
}

export interface LineRow {
    kind: "line";
    line: number;
    text: string;
}

export interface GapRow {
    kind: "gap";
    from: number;
    count: number;
}

export type CodeRow = LineRow | GapRow;
