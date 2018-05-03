import * as fs from 'fs';

export class TestHelper {

    private Models:any;

    constructor(modelsPath:string) {
        this.Models = require(modelsPath);
    }

    dropCollections(schemas:string[], callback?:() => void):void {
        let count = schemas.length;
        function counter() {
            count--;
            if (count === 0) {
                callback();
            }
        }

        for(let i = 0; i < schemas.length; i++)  {
            let schema  = schemas[i];
            let repository = this.Models[schema];
            repository.collection.drop(counter);
        }
    }

    insertDataFromFile(schema:string, filePath:string, callback?:(err:any, result:any) => void):void {
        let contents = fs.readFileSync(filePath);
        let data = JSON.parse(contents.toString());
        this.insertData(schema, data, callback);
    }

    insertData(schema:string, data:any, callback?:(err:any, result:any) => void):void {
        let repository = this.Models[schema];
        if (Array.isArray(data)) {
            repository.collection.insertMany(data, callback);
        } else {
            repository.collection.insertOne(data, callback);
        }
    }

    getInstance<T>(schema:string, values:any):T {
        let repository = this.Models[schema];
        return new repository(values) as T;
    }

    /*static checkSuccessfulResponse(res:any):void {
        let codes = { GET: 200, POST: 201, PUT: 204, DELETE: 204 },
            code = codes[res.req.method] || 200;
        res.should.have.status(code);
        if (code != 204) {
            res.should.be.a('object');
        }
    }*/

    static checkSuccessfulObjectResponse(res:any):void {
        //TestHelper.checkSuccessfulResponse(res);
        res.body.should.have.property('data');
        res.body.data.should.be.a('object');
    };

    static checkSuccessfulArrayResponse(res:any):void {
        //TestHelper.checkSuccessfulResponse(res);
        res.body.should.have.property('data');
        res.body.data.should.be.a('array');
    };

    static checkEachItemByPropertyValue(res:any, prop:string, val:any):void {
        for (let i = 0; i < res.body.data.length; i++) {
            res.body.data[i].should.have.property(prop).equal(val);
        }
    };

    static checkEachItemNotHavePropertyValue(res:any, prop:string, val:any):void {
        for (let i = 0; i < res.body.data.length; i++) {
            res.body.data[i].should.have.property(prop).not.equal(val);
        }
    };

    static checkErrorResponse(res:any):void {
        //res.should.have.status(400);
        res.body.should.have.property('error');
    };

    static checkNotFoundResponse(res:any, errorCode:string):void {
        //res.should.have.status(404);
        res.body.should.have.property('error');
        if (errorCode) {
            res.body.error.should.have.property('code');
            res.body.error.code.should.equal(errorCode);
        }
    };

    static checkNotAllowedResponse(res:any):void {
        //res.should.have.status(405);
    };

    static checkCodeErrorResponse(res:any, code:string):void {
        TestHelper.checkErrorResponse(res);
        res.body.error.code.should.equal(code);
    };

    static checkNotAuthorizedResponse(res:any):void {
        //res.should.have.status(401);
    };

    static checkCodeNotAuthorizedResponse(res:any, errorCode:string):void {
        TestHelper.checkNotAuthorizedResponse(res);
        res.body.should.have.property('code');
        res.body.code.should.equal(errorCode);
    };

    static checkValidationErrorResponse(res:any, key:string, value:any):void {
        TestHelper.checkCodeErrorResponse(res, 'ValidationError');
        res.body.error.should.have.property('data');
        res.body.error.data.should.have.property(key);
        res.body.error.data[key].should.equal(value);
    };

    static checkEachItemHaveProperties(res:any, properties:string[]):void {
        TestHelper.checkSuccessfulArrayResponse(res);
        let list:any[] = res.body.data;
        for (let i = 0; i < list.length; i++) {
            let item:any = list[i];
            for (let j = 0; j < properties.length; j++) {
                var p = properties[j];
                item.should.have.property(p);
            }
        }
    };

    static shouldHaveProperty(res:any, property:string, value?:any):void {
        TestHelper.checkSuccessfulObjectResponse(res);
        let item:any = res.body.data;
        item.should.have.property(property);
        if (value) {
            item[property].should.equal(value);
        }
    }

    static shouldHaveProperties(res:any, properties:string[]):void {
        TestHelper.checkSuccessfulObjectResponse(res);
        let item:any = res.body.data;
        for (let i = 0; i < properties.length; i++) {
            let p = properties[i];
            item.should.have.property(p);
        }
    };

    static checkEachItemNotHaveProperties(list:any[], properties:string[]):void {
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            TestHelper.shouldNotHaveProperties(item, properties);
        }
    };

    static shouldNotHaveProperties(item:any, properties:string[]):void {
        for (let i = 0; i < properties.length; i++) {
            let p = properties[i];
            item.should.not.have.property(p);
        }
    };

    static getLongString(len:number, sample:string = 'hello '):string {
        let str = sample,
            l = str.length;

        for (let i = 0; i < (len / l) + 1; i++) {
            str += sample;
        }
        return str;
    };

}