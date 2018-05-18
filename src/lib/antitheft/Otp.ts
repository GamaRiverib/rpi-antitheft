import { randomBytes } from 'crypto';
import * as jsSHA from 'jssha';

export class Otp {
    
    private static readonly base32Chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ABCDEFGHIJKLMNOPQRSTUVWXYZ234567

    private readonly len = 16;

    constructor() {

    }

    private decimalToHexadecimal(d: number): string {
        return (d < 15.5 ? '0' : '') + Math.round(d).toString(16);
    }

    private hexadecimalToDecimal(h: string): number {
        return parseInt(h, 16);
    }

    private base32ToHexadecimal(b: string): string {
        let bits = '';
        let hex = '';

        let i = 0;
        for(i = 0; i < b.length; i++) {
            let v = Otp.base32Chars.indexOf(b.charAt(i).toUpperCase());
            bits += this.leftpad(v.toString(2), 5, '0');
        }
        for(i = i % 8; i > 0; i--) {
            bits += this.leftpad('0', 5, '0');
        }
        for(i = 0; i + 4 <= bits.length; i += 4) {
            let c = bits.substr(i, 4);
            hex = hex + parseInt(c, 2).toString(16);
        }
        return hex;
    }

    private leftpad(s: string, l: number, p: string): string {
        if(l + 1 >= s.length) {
            s = Array(l + 1 - s.length).join(p) + s;
        }
        return s;
        }

        public generateTimebaseOneTimePassword(secret: string, options?: any): string {

        if (!options) {
            options = {};
        }

        let key = this.base32ToHexadecimal(secret);
        let opts = {
            step: options.step || 60,
            epoch: options.epoch || Math.round(new Date().getTime() / 1000.0),
            digits: options.digits || 6,
            algorithm: options.algorithm || 'SHA-512'
        };

        let time = this.leftpad(this.decimalToHexadecimal(Math.floor(opts.epoch / opts.step)), 16, '0');
        let sha = new jsSHA(opts.algorithm, 'HEX');
        sha.setHMACKey(key, 'HEX');
        sha.update(time);
        let hmac = sha.getHMAC('HEX');
        let offset = this.hexadecimalToDecimal(hmac.substr(hmac.length - 1));
        let totp = (this.hexadecimalToDecimal(hmac.substr(offset * 2, 8)) & this.hexadecimalToDecimal('7fffffff')) + ''; // TODO: 8??
        // console.log('before totp', totp);
        totp = (totp).substr(totp.length - opts.digits, opts.digits);
        return totp;
    }

    public getTotp(secret: string, options?: any): string {
        return this.generateTimebaseOneTimePassword(secret, options);
    }

    public getSecret(length?: number): string {
        return randomBytes(length || this.len)
            .map(val => Otp.base32Chars.charCodeAt(Math.floor(val * Otp.base32Chars.length / 256)))
            .toString();
    }

    public verify(token: string, secret: string, options?: any): boolean {
        if (!options) {
            options = {};
        }

        let totp: string = this.getTotp(secret, options);
        return totp == token;
    }
}