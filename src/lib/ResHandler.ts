import { Request, Response, Next } from 'restify';

export interface ApiResponse<T> {
    data?:T;
    message?:string;

    error?:ApiError;
}

export interface ApiError {
    code:string;
    name?:string;
    message?:string;
}

export class ResHandler {

    private res:Response;
    private codes = { 'GET': 200, 'POST': 201, 'PUT': 204, 'DELETE': 204 };

    constructor(res:Response) {
        this.res = res;
    }

    done(error:any, data:any):void {
        if(error) {
            this.error(error);
        } else {
            this.ok(data);
        }
    }

    ok(data:any, next?:Next):void {
        let code = this.codes[this.res.req.method] || 200;
        if (code == 204) {
            this.res.send(code);
        } else {
            let res = { data: data } as ApiResponse<any>;
            this.res.json(code, res);
        }
        if (next) {
            next();
        }
    }

    private errorResponse(error:string | any, message?:string, next?:Next, statusCode:number = 400) {
        let err:ApiError = { code: 'AppError' };
        if (typeof(error) == 'string') {
            err.code = error;
        } else {
            err.code = error.code || 'AppError';
            err.name = error.name || '';
            err.message = error.message || '';
        }
        let res:ApiResponse<any> = { error: err } as ApiResponse<any>;
        if (message) {
            res.message = message;
        }
        this.res.json(statusCode, res);
        if (next) {
            next();
        }
    }

    error(error:string | any, message?:string, next?:Next):void {
        this.errorResponse(error, message, next);
    }

    notFound(error:string | any, message?:string, next?:Next):void {
        this.errorResponse(error, message, next, 404);
    }

    conflict(error:string | any, message?:string, next?:Next):void {
        this.errorResponse(error, message, next, 409);
    }
}