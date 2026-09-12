const ESC = String.fromCharCode(27);

export function stripAnsi(text: string): string {
    return text.split(ESC)
            .map((part, index) => {
                if (index === 0)
                    return part;
                return part.replace(/^\[[0-9;]*m/, "");
            })
            .join("");
}
