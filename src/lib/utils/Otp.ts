import winston = require("winston");
import { Conversions } from "./Conversions";
import { randomBytes } from "crypto";
import jsSHA from "jssha";

import { getLogger } from "./Logger";

const logger: winston.Logger = getLogger("OTP");

export class Otp {

    private readonly len = 16;

    public generateTimebaseOneTimePassword(secret: string, options?: any): string {

        if (!options) {
            options = {};
        }

        try {
            const key = Conversions.base32ToHexadecimal(secret);
            const opts = {
                step: options.step || 60,
                epoch: options.epoch || Math.round(new Date().getTime() / 1000.0),
                digits: options.digits || 6,
                algorithm: options.algorithm || "SHA-1"
            };

            const time = Conversions.leftpad(Conversions.decimalToHexadecimal(Math.floor(opts.epoch / opts.step)), 16, "0");
            const sha = new jsSHA("SHA-1", "HEX");
            sha.setHMACKey(key, "HEX");
            sha.update(time);
            const hmac = sha.getHMAC("HEX");
            const offset = Conversions.hexadecimalToDecimal(hmac.substr(hmac.length - 1));
            // tslint:disable-next-line: no-bitwise
            let totp = (Conversions.hexadecimalToDecimal(hmac.substr(offset * 2, 8)) & Conversions.hexadecimalToDecimal("7fffffff")) + ""; // TODO: 8??
            totp = (totp).substr(totp.length - opts.digits, opts.digits);
            return totp;
        } catch(e) {
            logger.error(e);
            return "";
        }
    }

    public getTotp(secret: string, options?: any): string {
        return this.generateTimebaseOneTimePassword(secret, options);
    }

    public getSecret(length?: number): string {
        return randomBytes(length || this.len)
            .map((val: number) => Conversions.BASE_32_CHARS.charCodeAt(Math.floor(val * Conversions.BASE_32_CHARS.length / 256)))
            .toString();
    }

    public verify(token: string, secret: string, options?: any): boolean {
        if (!options) {
            options = {};
        }

        const totp: string = this.getTotp(secret, options);
        if(totp === "") {
            return false;
        }
        return totp === token;
    }
}