export class Conversions {

    // "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    // "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    public static readonly BASE_32_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUV";

    public static decimalToHexadecimal(d: number): string {
        return (d < 15.5 ? "0" : "") + Math.round(d).toString(16);
    }

    public static hexadecimalToDecimal(h: string): number {
        return parseInt(h, 16);
    }

    public static base32ToHexadecimal(b: string): string {
        let bits = "";
        let hex = "";

        let i = 0;
        for(i = 0; i < b.length; i++) {
            const v = Conversions.BASE_32_CHARS.indexOf(b.charAt(i).toUpperCase());
            bits += Conversions.leftpad(v.toString(2), 5, "0");
        }
        for(i = i % 8; i > 0; i--) {
            bits += Conversions.leftpad("0", 5, "0");
        }
        for(i = 0; i + 4 <= bits.length; i += 4) {
            const c = bits.substr(i, 4);
            hex = hex + parseInt(c, 2).toString(16);
        }
        return hex;
    }

    public static leftpad(s: string, l: number, p: string): string {
        if(l + 1 >= s.length) {
            s = Array(l + 1 - s.length).join(p) + s;
        }
        return s;
    }
}
