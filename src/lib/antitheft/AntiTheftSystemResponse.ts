import { AntiTheftSystemErrors } from "./AntiTheftSystemErrors";

export interface AntiTheftSystemResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
    error?: AntiTheftSystemErrors
}
