import { Application } from "express";
export abstract class Controller {
    abstract routes(app: Application):void;
}