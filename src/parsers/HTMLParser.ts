var parse5 = require('parse5');

import { Datatable, Column, Row } from '../common/Common';

import Log from '../Util';

const COLUMNS = [
    'fullname',
    'shortname',
    'number',
    'name',
    'address',
    'lat',
    'lon',
    'seats',
    'type',
    'furniture',
    'href'
];

export default class HTMLParser {

    public static parse(zipFiles: {[id: string]: JSZipObject }, datatable: Datatable): Promise<Datatable> {
        Log.trace('HTMLParser::parse( ... )');

        return datatable.createColumns(COLUMNS).then((col) => {
            return datatable.loadColumns(COLUMNS.map(col => datatable.id + '_' + col));
        }).then(() => {
            let promises: Promise<any>[] = [];
            for (var i in zipFiles) {
                if (zipFiles[i] && !zipFiles[i].dir) {
                    promises.push(this.parseRoom(zipFiles[i], i, datatable));
                }
            }
            return Promise.all(promises);
        }).then(() => {
            return datatable;
        }).catch((e) => {
            Log.trace('HTMLParser::parse( error pushing data to columns ) ' + e);
            return e;
        });
    }

    public static parseRoom(zip: JSZipObject, filePath: string, datatable: Datatable): Promise<number> {
        return new Promise((resolve, reject) => {
            zip.async('string').then((res) => {
                let document = parse5.parse(res);
                let html = document.childNodes.find((node: any) => node.nodeName === 'html');
                let body = html.childNodes.find((node: any) => node.nodeName === 'body');
                let dtable = body.childNodes[31];

                if (!dtable) return resolve();

                try {
                    let placeholder = dtable.
                        childNodes[10].
                        childNodes[1].
                        childNodes[3].
                        childNodes[1];

                    let title = placeholder.
                        childNodes[3].
                        childNodes[1].
                        childNodes[1].
                        childNodes.
                        filter((node: any) => node.attrs).
                        find((node: any) =>
                             node.attrs.some((attr: any) =>
                                             attr.name ==='id' && attr.value === 'building-info'));

                    let data = placeholder.
                        childNodes[5].
                        childNodes[1].
                        childNodes[3];

                    if (!(title && data)) return resolve();

                    let table = data.childNodes.find((node: any) => node.nodeName === 'table');

                    if (!table) return resolve();

                    let building = this.getBuildingInfo(title);

                    let thead = table.childNodes.find((node: any) => node.nodeName === 'thead');
                    let tbody = table.childNodes.find((node: any) => node.nodeName === 'tbody');

                    let headers = this.getHeaders(thead);
                    let values = this.getTableValues(tbody, headers);

                    let names = filePath.split('/');
                    let shortname = names[names.length - 1];

                    let rows = values.map((room: any) => [
                        building['fullname'],
                        shortname,
                        room['number'],
                        room['name'],
                        building['address'],
                        0,
                        0,
                        room['seats'],
                        room['type'],
                        room['furniture'],
                        room['href']
                    ]);

                    return geocodeAddress(rows);
                } catch (e) {
                    // idk what to do here
                    // should we still persist _partial_ data into db?
                    return resolve();
                }
            }).then((data: any[]) => {
                data.forEach((row: any[]) => {
                    row.forEach((val: any, index: number) => datatable.columns[index].insertCellFast(val));
                });

                return resolve(true);
            }).catch(e => {
                reject(e);
            });
        });
    }

    // returns table headers like ['Room', 'Capacity', 'Type']
    private static getHeaders(thead: any): string[] {
        if (!thead || thead.nodeName !== 'thead') return [];

        return thead.childNodes.
            find((node: any) => node.nodeName === 'tr').childNodes.
            filter((node: any) => node.nodeName === 'th').
            map((node: any) => node.childNodes[0].value.trim());
    }

    private static getTableValues(tbody: any, headers: string[]): {}[] {
        if (!tbody || tbody.nodeName !== 'tbody') return [];

        return tbody.childNodes.
            filter((node: any) => node.nodeName === 'tr').
            map((node: any) => this.getRowValues(node, headers));
    }

    private static getRowValues(tr: any, headers: string[]): {[col:string]: string|number} {
        if (!tr || tr.nodeName !== 'tr') return {};

        let nodes: any = tr.childNodes.
            filter((node: any) => node.nodeName === 'td');

        return {
            'number': getRoomNumber(nodes[0]),
            'href': getRoomLink(nodes[0]),
            'seats': parseInt(getRoomSeats(nodes[1]).trim()),
            'furniture': getRoomFurniture(nodes[2]).trim(),
            'type': getRoomType(nodes[3]).trim()
        }
    }

    private static findById(root: any, id: string): any {
        if (!root) return null;

        if (root.attrs.some((attr: any) => attr.name === 'id' && attr.value === id)) {
            return root;
        }

        let children = root.childNodes.
            map((node: any) => this.findById(node, id)).
            filter((node: any) => !node);

        return children.length === 1 ? children[0] : null;
    }

    private static getBuildingInfo(node: any): {[col:string]:string|number} {
       return {
           'fullname': getBuildingFullName(node.childNodes[1]),
           'address': getBuildingAddress(node.childNodes[3])
       };
    }
}

function getRoomLink(tdnode: any): string {
    return tdnode.childNodes.
        find((node: any) => node.nodeName === 'a').attrs.
        find((attr: any) => attr.name === 'href').value || ""
}
function getRoomNumber(tdnode: any): string {
    return tdnode.childNodes.
        find((node: any) => node.nodeName === 'a').
        childNodes[0].value || "";
}

function getRoomSeats(tdnode: any): string {
    return tdnode.childNodes[0].value || "0";
}

function getRoomFurniture(tdnode: any): string {
    return tdnode.childNodes[0].value || "";
}

function getRoomType(tdnode: any): string {
    return tdnode.childNodes[0].value || "";
}

function getBuildingFullName(h2node: any): string {
    return h2node.childNodes[0].childNodes[0].value || "";
}

function getBuildingAddress(divnode: any): string {
    return divnode.childNodes[0].childNodes[0].value || "";
}

// TODO move to src/common/Geocode.ts or whatever
function geocodeAddress(data: any[][]): Promise<any> {
    return new Promise((resolve, reject) => {
        return resolve(data);
    });
}
