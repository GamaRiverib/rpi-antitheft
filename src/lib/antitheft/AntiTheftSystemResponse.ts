import { AntiTheftSystemErrors } from "./AntiTheftSystemErrors";

export interface AntiTheftSystemResponse {
    success: boolean;
    data?: any;
    message?: string;
    error?: AntiTheftSystemErrors
}