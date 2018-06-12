import { Utils } from './Utils';
import { randomBytes } from 'crypto';
import * as jsSHA from 'jssha';

export class Otp {

    private readonly len = 16;

    constructor() {

    }

    public generateTimebaseOneTimePassword(secret: string, options?: any): string {

        if (!options) {
            options = {};
        }

        let key = Utils.base32ToHexadecimal(secret);
        let opts = {
            step: options.step || 60,
            epoch: options.epoch || Math.round(new Date().getTime() / 1000.0),
            digits: options.digits || 6,
            algorithm: options.algorithm || 'SHA-512'
        };

        let time = Utils.leftpad(Utils.decimalToHexadecimal(Math.floor(opts.epoch / opts.step)), 16, '0');
        let sha = new jsSHA(opts.algorithm, 'HEX');
        sha.setHMACKey(key, 'HEX');
        sha.update(time);
        let hmac = sha.getHMAC('HEX');
        let offset = Utils.hexadecimalToDecimal(hmac.substr(hmac.length - 1));
        let totp = (Utils.hexadecimalToDecimal(hmac.substr(offset * 2, 8)) & Utils.hexadecimalToDecimal('7fffffff')) + ''; // TODO: 8??
        // console.log('before totp', totp);
        totp = (totp).substr(totp.length - opts.digits, opts.digits);
        return totp;
    }

    public getTotp(secret: string, options?: any): string {
        return this.generateTimebaseOneTimePassword(secret, options);
    }

    public getSecret(length?: number): string {
        return randomBytes(length || this.len)
            .map(val => Utils.BASE_32_CHARS.charCodeAt(Math.floor(val * Utils.BASE_32_CHARS.length / 256)))
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