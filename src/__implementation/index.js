// trigger ✔️
// delay ✔️
// new-tab ✔️
// active-tab ✔️
// switch-tab ✔️
// close-tab ✔️
// tab-url ✔️
// click-element ✔️
// forms .
// trigger-event .
// upload-file
// save-assets ✔️
// conditional .
// loop-data .
// loop-break .
// insert-data ✔️
// delete-data

import puppeteer from 'puppeteer';
import fs from 'fs';
import data from './data.json' with { type: "json" };
import { Readable } from 'stream';
import { finished } from 'stream/promises';
const nodes = data.drawflow.nodes;
const edges = data.drawflow.edges;
const triggerId = nodes.find(node => node.label === 'trigger').id;

const browser = await puppeteer.launch(
    { headless: false, slowMo: 5 }
);

const labelFunction = {
    "trigger": trigger,
    "new-tab": newTab,
    "insert-data": insertData,
    "delay": delay,
    "event-click": eventClick,
    "switch-tab": switchTab,
    "tab-url": tabUrl,
    "save-assets": saveAssets,
    "close-tab": closeTab
};

const nextNode = [{ nodeId: triggerId, page: null, data: [] }];
while (nextNode.length !== 0) {
    const node = nextNode.shift();
    const func = labelFunction[nodes.find(x => x.id === node.nodeId).label];
    console.log(nodes.find(x => x.id === node.nodeId).label);
    const state = await func(node.page, node.data, nodes.find(x => x.id === node.nodeId).data);
    const nextEdges = edges.filter(edge => edge.source === node.nodeId);
    nextEdges.forEach(edge => {
        nextNode.push({ nodeId: edge.target, page: state.page, data: state.data });
    });
    if (nextEdges.length === 0) {
        console.log("End of the flow");
        browser.close();
    }
}

async function newTab(page, data, input) {
    const page_ = await browser.newPage();
    let url = mustacheReplace(data, input.url);
    page_.goto(url);
    return {
        page: page_,
        data: [...data]
    };
}

async function trigger(page, data, input) {
    return {
        page,
        data: [...data]
    };
}

async function insertData(page, data, input) {
    return {
        page,
        data: [
            ...data,
            ...input.dataList
        ]
    };
};

async function delayUtils(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time);
    });
}

async function delay(page, data, input) {
    console.log("Delaying for " + input.time + "ms");
    await delayUtils(input.time);
    return {
        page,
        data: [...data]
    };
}

async function eventClick(page, data, input) {
    console.log("Waiting for selector " + input.selector);
    await page.waitForSelector(input.selector);
    const handle = (await page.$$(input.selector))[0];
    console.log("Clicking on the element");
    await handle.evaluate((element) => element.click());
    return {
        page,
        data: [...data]
    };
}

async function switchTab(page, data, input) {
    const pages = await browser.pages();
    const regex = new RegExp(input.matchPattern);
    const result = {
        page: null,
        data: [...data]
    };
    if (input.findTabBy === "match-patterns") {
        result.page = pages.filter(x => x.url().match(regex))[input.tabIndex];
    } else {
        result.page = pages.filter(x => x.url() === input.url)[input.tabIndex];
    }
    return result;
}

async function tabUrl(page, data, input) {
    let page_ = page;
    if (input.type === "active-tab") {
        page_ = await getActiveTab();
    }

    const result = {
        page,
        data: [...data]
    };

    if (input.assignVariable) {
        result.data.push({
            type: "variable",
            name: input.variableName,
            value: page_.url()
        });
    }

    return result;
}

async function saveAssets(page, data, input) {
    if (input.type === "url") {
        const url = mustacheReplace(data, input.url);
        console.log("Downloading file from " + url);
        await fetch(url)
            .then(response => response)
            .then(response => {
                return { fileStream: fs.createWriteStream(mustacheReplace(data, input.filename), { flags: 'wx' }), blob: response.body };
            }).then(({ fileStream, blob }) => finished(Readable.fromWeb(blob).pipe(fileStream)));
    }

    return {
        page,
        data: [...data]
    };
}

async function closeTab(page, data, input) {
    await page.close();
    return {
        page: null,
        data: [...data]
    };
}

async function getActiveTab(page, data, input) {
    const pages = await page.browser().then(x => x.pages());
    const vis_results = await Promise.all(pages.map(async (p) => {
        const state = await p.evaluate(() => document.webkitHidden);
        return !state;
    }));
    return pages.find((_v, index) => vis_results[index]);
}

function mustacheReplace(data, input) {
    let input_ = input;
    const regex = new RegExp("{{(\\w+)@(\\w+)}}", "g");
    const replacement = [];
    let match;
    while ((match = regex.exec(input_)) !== null) {
        if (match[1] === "variables") {
            replacement.push(data.find(x => x.type === "variable" && x.name === match[2]).value);
        }
    }
    const regexLocal = new RegExp("{{(\\w+)@(\\w+)}}");
    replacement.forEach((value) => {
        input_ = input_.replace(regexLocal, value);
    });
    return input_;
}