/**
 * window.webview 是一个内置全局变量，封装了一些与宿主交互的方法
 * @type {import("../types").Webview}
 */
var webview;

let me = webview.self_uin;
let c2c = webview.c2c;
let uin = webview.target_uin;
let nick = webview.nickname;
let facePath = webview.faces_path;


const jsonCardHandler = {};
const xmlCardHandler = {};


let keepBottom = false;

// 监听消息和通知
webview.on("message", (data) => {
    const msg = data.detail;
    document.querySelector("#console").insertAdjacentHTML("beforeend", genUserMessage(msg));
    if (keepBottom) {
        webview.scrollEnd();
    }
});

webview.on("notice", (data) => {
    const msg = data.detail;
    document.querySelector("#console").insertAdjacentHTML("beforeend", genSystemMessage(msg));
    if (keepBottom) {
        webview.scrollEnd();
    }
});

//init
document.querySelector("body").insertAdjacentHTML("beforeend", `
<div id="container">
    <div style="text-align: center">
        <a onclick="loadMore()" href="javascript:void(0)">Load More</a>
    </div>
    <div id="console"></div>
    <img id="img-preview" style="z-index: 999;position: fixed">
    <div class="sticky-box">
        <textarea id="commandline" rows="4" type="text" name="command_line" placeholder=""></textarea>
        <a href="javascript:void(0)" id="show-stamp-box" style="padding: 10px">[STAMP]</a>
        <div class="stamp-box box"></div>
        <a href="javascript:void(0)" id="show-face-box" style="padding: 10px">[FACE]</a>
        <div class="face-box box"></div>
        <a href="javascript:void(0)" id="show-emoji-box" style="padding: 10px">[EMOJI]</a>
        <div class="emoji-box box"></div>
        <input id="keep-bottom" type="checkbox">
        <label for="keep-bottom" style="color: gray;">Keep Bottom</label>
    </div>
</div>`);

document.getElementById("keep-bottom").addEventListener('change', e => {
    keepBottom = e.target.checked;
    console.debug(`keepBottom is now ${keepBottom}`)
})

console.log('loading console.')

// add face to document
let tmpFaceStep = 0;
for (let i = 0; i <= 324; ++i) {
    if (i === 275 || (i > 247 && i < 260)) {
        continue;
    }
    ++tmpFaceStep;
    let html = `<img onclick="addFace(${i})" style="margin:5px;cursor:pointer" width="28" height="28" src="${facePath + i + ".png"}">`;
    document.querySelector('.face-box').insertAdjacentHTML("beforeend", html);
}

// add stamp to document
webview.getRoamingStamp().then((data) => {
    if (data.retcode === 0) {
        let tmpStampStep = 0;
        for (let i = data.data.length - 1; i >= 0; --i) {
            ++tmpStampStep;
            const url = data.data[i];
            let html = `<img onclick="addImage('${url}')" src="${url}">` + (tmpStampStep % 6 === 0 ? "<br>" : "");
            document.querySelector('.stamp-box').insertAdjacentHTML("beforeend", html);
        }
    }
});

// add emoji to document
let tmpEmojiStep = 0;
function addEmoji2Box(from, to) {
    for (let i = from; i <= to; ++i) {
        ++tmpEmojiStep;
        let str = String.fromCodePoint(i);
        let html = `<span onclick="appendToTextArea('${str}')" style="cursor:pointer">` + str + "</span>";
        document.querySelector('.emoji-box').insertAdjacentHTML("beforeend", html);
    }
}
addEmoji2Box(0x1F600, 0x1F64F);
addEmoji2Box(0x1F90D, 0x1F945);
addEmoji2Box(0x1F400, 0x1F4FF);
addEmoji2Box(0x1F300, 0x1F320);
addEmoji2Box(0x1F32D, 0x1F394);
addEmoji2Box(0x1F3A0, 0x1F3FA);
addEmoji2Box(0x1F680, 0x1F6C5);
addEmoji2Box(0x1F004, 0x1F004);



document.querySelector("body").addEventListener("click", (e) => {
    document.querySelector('.face-box').style.display = 'none';
    document.querySelector('.emoji-box').style.display = 'none';
    document.querySelector('.stamp-box').style.display = 'none';
    if (e.target === idShowStampBox) {
        document.querySelector('.stamp-box').style.display = 'block';
    } else if (e.target === idShowFaceBox) {
        document.querySelector('.face-box').style.display = 'block';
    } else if (e.target === idShowEmojiBox) {
        document.querySelector('.emoji-box').style.display = 'block';
    }
});


const idPreviewElement = document.querySelector("#img-preview");
const idShowStampBox = document.querySelector('#show-stamp-box');
const idShowFaceBox = document.querySelector('#show-face-box');
const idShowEmojiBox = document.querySelector('#show-emoji-box');


function getChatHistory(message_id = "", count = 20, scrollEnd = true) {
    webview.getChatHistory(message_id, count).then((data) => {
        let html = "";
        for (let msg of data.data) {
            if (checkMessageElementExist(msg.message_id)) {
                continue;
            }
            html += genUserMessage(msg);
        }
        document.querySelector("#console").insertAdjacentHTML("afterbegin", html);
        if (scrollEnd) {
            webview.scrollEnd();
        }
    });
}

function checkMessageElementExist(id) {
    for (const cmsg of document.querySelectorAll(".cmsg")) {
        if (cmsg?.attributes.id.value == id) {
            return true;
        }
    }
    return false;
}

function loadMore() {
    getChatHistory(document.querySelector(".cmsg")?.attributes.id.value ?? "", 5, false);
}

getChatHistory();


let sending = false;
const pastedImageBufferSize = 10_000_000;
/** @type {{ placeholder: string, cqcode: string, url: string }[]} */
const pastedImageMappings = [];

function sendMsg() {

    const commandLine = document.querySelector("#commandline");

    let message = commandLine.value;
    if (sending || !message || !message.replaceAll('\n', '')) {
        return;
    }
    sending = true;
    commandLine.disabled = true;
    commandLine.classList.add("sending");
    const splitted = [];
    let messageHtml = '';
    while (true) {
        let begin = Infinity;
        /** @type {typeof pastedImageMappings[0]} */
        let found;
        for (const x of pastedImageMappings) {
            const index = message.indexOf(x.placeholder);
            if (index != -1 && index < begin) {
                found = x;
                begin = index;
            }
        }

        if (begin === Infinity) {
            messageHtml += filterXss(message);
            splitted.push(message);
            break;
        }
        const before = message.slice(0, begin);

        splitted.push(before);
        splitted.push(found.cqcode);
        message = message.slice(begin + found.placeholder.length);

        messageHtml += filterXss(before);
        messageHtml += `<a href="${found.url}" target="_blank" onmouseenter="previewImage(this)">粘贴的图片</a>`;
    }
    // 真正的消息，已经把把图片占位符转换成了 CQ 码
    const realMessage = splitted.join("");

    // 计算目前的空间占用，清理比较老的图片
    let currentSize = 0;
    let clearIndex = pastedImageMappings.length - 1;
    for (; clearIndex >= 0; --clearIndex) {
        const size = pastedImageMappings[clearIndex].cqcode.length / 4 * 3;
        currentSize += size;
        if (currentSize >= pastedImageBufferSize) {
            break;
        }
    }
    if (clearIndex > 0) {
        const removed = pastedImageMappings.splice(0, clearIndex);
        for (const { url } of removed) {
            URL.revokeObjectURL(url);
        }
        console.log(`Removed ${removed.length} items`);
    }

    webview.sendMsg(realMessage).then((data) => {
        // 发送失败
        if (data.retcode > 1) {
            document.querySelector("#console").insertAdjacentHTML("beforeend", `<div class="cmsg">
     <span class="name">
         <font color="red">[ERROR]</font>
         - ${new Date} - ${data.error?.message}
     </span>
 </div>`);
            return;
        }

        // 私聊需要自己打印消息
        if (webview.c2c && data.data.message_id) {
            const html = `<div class="cmsg">
     <span class="name">
         <font color="green">[INFO]</font>
         - ${webview.datetime()} -
         me<${webview.self_uin}>:
     </span><br>
     <pre class="content">${filterXss(message)}</pre>
 </div>`;
            document.querySelector("#console").insertAdjacentHTML("beforeend", html);
        }
    }).catch((e) => {
        console.error(e);
    }).finally(() => {
        commandLine.value = "";
        sending = false;
        commandLine.disabled = false;
        commandLine.classList.remove("sending");
        commandLine.focus();
        webview.scrollEnd();
    });
}

/**
 * xss过滤
 * @param {string} str 
 */
function filterXss(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 生成聊天消息
 * @param {import("oicq").PrivateMessageEventData | import("oicq").GroupMessageEventData} data 
 */
function genUserMessage(data) {
    console.debug(data)
    return `<div class="cmsg" id="${data.message_id}">
     <span class="name">
         <font color="green">[INFO]</font>
         - ${webview.datetime(data.time)} - <span ondblclick="addAt(${data.user_id})">${data.user_id} - 
         ${getShortedName(data.sender)}</span>:
     </span><br>
     <pre class="content" ondblclick="addReply('${data.message_id}'); addAt(${data.user_id});">${parseMessage(data.message)}</pre>
 </div>`;
}

/**
 * 加入at元素到输入框
 * @param {number|"all"} uid 
 */
function addAt(uid) {
    if (c2c) {
        return;
    }
    const cqcode = `[CQ:at,qq=${uid}] `;
    appendToTextArea(cqcode);
}

function addReply(id) {
    if (c2c) return;
    const cqcode = `[CQ:reply,id=${id}]`
    appendToTextArea(cqcode);
}


function getShortedName(sender) {
    const username = filterXss(sender.card ? sender.card : sender.nickname);
    const bracket = /\(.+\)/g
    return username.replace(bracket, "");
}


const fingers = {
    1: '石头',
    2: '剪刀',
    3: '布',
}

function parseMessage(message) {
    let msg = "";
    for (let v of message) {
        switch (v.type) {
            case "text":
                msg += filterXss(v.data.text).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');
                break;
            case "at":
                msg += `<a title="${v.data.qq}" href="javascript:void(0);" onclick="addAt('${v.data.qq}');">${filterXss(v.data.text)}</a>`;
                break;
            case "face":
                if (v.data.id > 324) {
                    msg += v.data.text || "[表情]";
                } else {
                    msg += `<img class="face" ondblclick="addFace(${v.data.id})" src="${facePath + v.data.id}.png">`;
                }
                break;
            case "sface":
            case "bface":
                if (v.data.text) {
                    msg += "[" + filterXss(v.data.text) + "]";
                } else {
                    msg += "[表情]";
                }
                break;
            case "image":
            case "flash":
                if (!c2c) {
                    v.data.url = v.data.url.replace(/\/[0-9]+\//, "/0/").replace(/[0-9]+-/g, "0-");
                }
                let split = v.data.file.split("-");
                let width = parseInt(split[1]), height = parseInt(split[2]);
                msg += `<a href="${v.data.url}&file=${v.data.file}&vscodeDragFlag=1" target="_blank" onmouseenter="previewImage(this,${width},${height})">${v.type === "image" ? "图片" : "闪照"}</a>`;
                break;
            case "record":
                // 语音消息不支援HTML播放, 因为HTML不支援 .amr / .silk 格式 
                msg = `<a href="${v.data.url}" target="_blank">语音消息</a>`;
                break;
            case "video":
                console.log(v.data)
                msg = `<a href="javascript:void(0)" onclick="javascript:var s=this.nextElementSibling.style;if(s.display=='block')s.display='none';else s.display='block'">[视频消息]</a><video height=200 style="display:none" src="${v.data.url}" controls />`;
                break;
            case "xml":
                const dom = new DOMParser().parseFromString(v.data.data, "text/xml");
                if (dom.querySelector("msg")?.getAttribute("serviceID") === "35") {
                    try {
                        const resid = /resid="[^"]+"/.exec(v.data.data)[0].replace("resid=\"", "").replace("\"", "");
                        msg = `<a href="javascript:void(0)" onclick="triggerForwardMsg(this)" id="${resid}">[合并转发]</a><span class="msg-forward"></span>`;
                    } catch {
                        msg = `<a href="javascript:void(0)" onclick="javascript:var s=this.nextElementSibling.style;if(s.display=='block')s.display='none';else s.display='block'">[嵌套转发]</a><span style="display:none">${filterXss(v.data.data)}</span>`;
                    }
                } else {
                    if (dom.querySelector("msg")?.getAttribute("action") === "web") { //判断是否为链接分享
                        const title = dom.querySelector("msg").getAttribute("brief");
                        const url = dom.querySelector("msg").getAttribute("url");
                        msg = `<a href="${filterXss(url)}">${filterXss(title)}</a><br>` + filterXss(dom.querySelector("summary")?.innerHTML);
                    } else {
                        msg = `<a href="javascript:void(0)" onclick="javascript:var s=this.nextElementSibling.style;if(s.display=='block')s.display='none';else s.display='block'">[XML卡片消息]</a><span style="display:none">${filterXss(v.data.data)}</span>`;
                    }
                }
                break;
            case "json":
                try {

                    const jsonObj = JSON.parse(v.data.data);

                    if (jsonCardHandler[jsonObj.app] instanceof Function){
                        msg = jsonCardHandler[jsonObj.app](jsonObj)
                    } else {
                        msg = `<a href="javascript:void(0)" onclick="javascript:var s=this.nextElementSibling.style;if(s.display=='block')s.display='none';else s.display='block'">[JSON卡片消息]</a><span style="display:none">${filterXss(JSON.stringify(jsonObj, null, 4))}</span>`;
                    }

                } catch { }
                break;
            case "file":
                msg = `<a href="${v.data.url}" target="_blank">文件: ${filterXss(v.data.name)} (${v.data.size / 1e6}MB)</a>`;
                break;
            case "reply":
                if (message[1]?.type === "at" && message[3]?.type === "at" && message[1]?.data.qq === message[3]?.data.qq) {
                    message.splice(1, 2);
                }
                msg += `<a href="#${v.data.id}" onclick="document.querySelector('#${filterMsgIdSelector(v.data.id).replace(/\\/g, "\\\\")}')?.animate([{'background':'#cccccc'}],{duration: 3000})">[回复]</a>`;
                break;
            case "rps":
                msg += `[猜拳: ${fingers[v.data.id] ?? v.data.id}]`;
                console.log(message)
                break;
            case "dice":
                msg += `[骰子: ${v.data.id}]`;
                break;
            case "shake":
                msg = "[窗口抖动]";
                break;
            case "poke":
                msg = "[戳一戳]";
                break;
        }
    }
    return msg;
}

/**
 * 转义message_id中的特殊字符
 * @param {string} message_id 
 */
function filterMsgIdSelector(message_id) {
    return message_id.replace(/\//g, "\\/").replace(/\=/g, "\\=").replace(/\+/g, "\\+");
}

/**
 * 生成系统消息
 * @param {import("oicq").GroupNoticeEventData | import("oicq").FriendNoticeEventData} data 
 */
function genSystemMessage(data) {
    let msg = "";
    if (data.notice_type === "group") {
        switch (data.sub_type) {
            case "increase":
                msg = `${data.user_id} joined the group.`;
                break;
            case "decrease":
                if (data.dismiss) {
                    msg = `This group is dismissed`;
                } else {
                    msg = `${data.user_id} left from the group`;
                }
                break;
            case "ban":
                if (data.user_id > 0)
                    msg = `${data.operator_id} muted ${data.user_id} ${data.duration} seconds.`;
                else
                    msg = `${data.operator_id} ${data.duration > 0 ? "enabled" : "disabled"} muteAll.`;
                break;
        }
    }
    if (!msg) {
        return "";
    }
    return `<div class="cmsg">
     <span class="name">
         <font color="orange">[NOTICE]</font>
         - ${webview.datetime(data.time)} - ${msg}
     </span>
 </div>`;
}

// 粘贴图片
document.querySelector("#commandline").addEventListener("paste", async ev => {
    /** @type {DataTransfer} */
    const clipboardData = (ev.clipboardData || ev.originalEvent.clipboardData);
    const pasted = await Promise.all(Array.from(clipboardData.items).map(item => {
        if (item.kind !== "file") {
            // 处理富文本会比较麻烦，交给 textarea 自己去处理吧（
            // 可是，这样其实有个问题，假如同时复制了交错的文字与图片
            // 那么顺序将会被打乱 - 首先是 textarea 自己粘贴的文字，之后才是图片
            // 该怎么办才好呀 qwq
            return Promise.resolve('');
        }
        if (!item.type.startsWith("image/")) {
            return Promise.resolve(`（暂不支持的文件类型：${item.type}）`);
        }

        return new Promise((resolve, reject) => {
            const blob = item.getAsFile();
            const url = URL.createObjectURL(blob);

            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(",")[1];
                const cqcode = `[CQ:image,file=base64://${base64}]`;
                const placeholder = `[粘贴的图片 ${url}]`;
                pastedImageMappings.push({ placeholder, cqcode, url });
                resolve(placeholder);
            }
            reader.onerror = reject;
            reader.readAsDataURL(blob)
        })
    }))
    const text = pasted.join("");
    appendToTextArea(text);
})

/**
 * 加入表情到输入框
 * @param {number} id 
 */
 function addFace(id) {
    const cqcode = `[CQ:face,id=${id}]`;
    appendToTextArea(cqcode);
}


/**
 * 加入图片到输入框
 * @param {string} file 
 */
function addImage(file) {
    const cqcode = `[CQ:image,file=${file},type=face]`;
    appendToTextArea(cqcode);
}

function appendToTextArea(str) {
    const area = document.querySelector("#commandline");
    area.value += str;
    area.focus();
}

function setTextareaText(str) {
    document.querySelector("#commandline").value = str;
    document.querySelector("#commandline").focus();
}

function previewImage(obj, width, height) {
    const url = obj.href ?? obj.src.replace("100", "640");
    if (width > 0 && width <= 200) {
        width = width + "px";
        height = "auto";
    } else if (height > 0 && height <= 200) {
        width = "auto";
        height = height + "px";
    } else if (height > 200 && width > 200) {
        if (width >= height) {
            width = "auto";
            height = "200px";
        } else {
            width = "200px";
            height = "auto";
        }
    } else {
        width = "200px";
        height = "auto";
    }
    idPreviewElement.style.width = width;
    idPreviewElement.style.height = height;
    let left = obj.getBoundingClientRect().x + 20;
    if (left + 150 > window.innerWidth) {
        left -= 200;
    }
    let top = obj.getBoundingClientRect().y - 5;
    idPreviewElement.src = url;
    idPreviewElement.style.left = left + "px";
    idPreviewElement.style.top = top + "px";
    idPreviewElement.style.display = "block";
    obj.onmouseleave = () => idPreviewElement.style.display = "none";
}

function triggerForwardMsg(obj) {
    const resid = obj.id;
    const elememt = obj.nextElementSibling;
    if (elememt.style.display === "block") {
        elememt.style.display = "none";
    } else {
        elememt.style.display = "block";
    }
    if (elememt.innerHTML === "" || elememt.innerHTML === "加载失败") {
        elememt.innerHTML = "...";
        webview.getForwardMsg(resid).then(data => {
            let html = "";
            console.debug(data.data)
            for (let v of data.data) {
                html += `<p>👤${filterXss(v.nickname)}(${v.user_id}) ${datetime(v.time)}</p>${parseMessage(v.message)}`;
            }
            if (!html) {
                html = "加载失败。原信息: "+JSON.stringify(data);
            }
            elememt.innerHTML = `
            =========================
            <br>
            ${html}
            <br>
            =========================
            `;
        }).catch(err => {
            console.error(err)
            elememt.innerHTML = `加载错误: ${err.message ? err.message : err}`;
        });
    }
}


function timestamp(unixstamp) {
    return webview.timestamp(unixstamp);
}
function datetime(unixstamp) {
    return webview.datetime(unixstamp);
}

// Enter
window.onkeydown = function (event) {
    if (event.keyCode !== 13) return;
    if (event.shiftKey) {
       commandLine.value += '\n' 
    } else {
        sendMsg();
    }
};


// ========= JSON Card Handlers ===========

Object.assign(jsonCardHandler, {

    'com.tencent.mannounce': (data) => {
        const mannounce = data.meta.mannounce
        const title = decodeURIComponent(escape(atob(mannounce.title)));
        const content = decodeURIComponent(escape(atob(mannounce.text)));
        return `<span class="jsonMsgTitle">${filterXss(title)}</span><br/><span class="jsonMsgContent">${filterXss(content)}</span><br/>`;
    },

    'com.tencent.miniapp_01': (data) => {
        const { desc: title, preview, qqdocurl: url, title: platform } = data.meta.detail_1
        const btn = `<a href="javascript:void(0)" onclick="javascript:var s=this.nextElementSibling.style;if(s.display=='block')s.display='none';else s.display='block'">[${platform}分享]</a>`

        const img = preview.startsWith('http') ? preview : `https://${preview}`
        
        const content = `<span style="display:none;">
<a href="${url}" target="_blank">${title}</a><br>
<a href="${img}" target="_blank" onmouseenter="previewImage(this,0,0)">[封面]</a>
        </span>`
        return `${btn}${content}`
    },

    'com.tencent.structmsg': (data) => {
        const prompt = data.prompt
        const { title, preview, jumpUrl: url, tag: platform, desc } = data.meta.news
        const btn = `<a href="javascript:void(0)" onclick="javascript:var s=this.nextElementSibling.style;if(s.display=='block')s.display='none';else s.display='block'">${prompt}[${platform}]</a>`
        const content = `<span style="display:none;">
<a href="${url}" target="_blank">${title}</a>${title == desc ? '' : `<h5>${desc}</h5>`}<br>
<a href="${preview}" target="_blank" onmouseenter="previewImage(this,0,0)">[封面]</a>
        </span>`
        return `${btn}${content}`
    },  

})