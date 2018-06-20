export class Logger {

    public static log(message: string, ... args: any[]): void {
        if(args.length > 0) {
            console.log(`[${new Date().toLocaleTimeString()}]\t${message}\t`, args);
        } else {
            console.log(`[${new Date().toLocaleTimeString()}]\t${message}`);
        }
    }
}