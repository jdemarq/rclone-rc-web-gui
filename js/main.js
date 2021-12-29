var panelsPaths = {
    "leftPanelFiles": "",
    "rightPanelFiles": ""
}

transfersQueue = []

var spanOK = "<span>✅</span>";
var spanFAIL = "<span>❌</span>";

initialize();

function initialize()
{
    // get versions
    sendRequestToRclone("/core/version", "", function(rez)
    {
        document.getElementById("rcloneOS").textContent = rez["os"].concat(" (", rez["arch"], ")");
        document.getElementById("rcloneVersion").textContent = rez["version"];
        document.getElementById("guiVersion").textContent = guiVersion;
    });

    // get remotes
    sendRequestToRclone("/config/listremotes", "", function(rez)
    {
        updateRemotesSelects("leftPanelRemote", rez);
        updateRemotesSelects("rightPanelRemote", rez);
    });

    refreshView();
}

window.setInterval(function () { refreshView(); }, timerRefreshView);
window.setInterval(function () { processQueue(); }, timerProcessQueue);

function sendRequestToRclone(query, params, fn)
{
    let url = rcloneHost.concat(":", rclonePort, rcloneDir  , query);
    let xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", "Basic " + btoa(rcloneUser.concat(":", rclonePass)));

    if (params === "") { xhr.send(); }
    else
    {
        if (asyncOperations.includes(query))
        {
            params["_async"] = true;
        }
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(params));
    }

    xhr.onload = function()
    {
        if (xhr.status != 200)
        {
            console.group("Request has failed");
            console.error("Error, HTTP status code:", xhr.status);
            if (xhr.status === 500)
            {
                let rezError = JSON.parse(xhr.response)["error"];
                if (rezError !== undefined && rezError !== null)
                {
                    console.error(rezError);
                    //alert("rclone reported an error. Check console for more details");
                }
            }
            console.groupEnd();
            fn(null);
        }
        else
        {
            //console.debug(xhr.response);
            fn(JSON.parse(xhr.response));
        }
    };

    xhr.onerror = function()
    {
        console.error("Couldn't send the request");
    };
}

function updateRemotesSelects(selectID, optionsList)
{
    let selectObj = document.getElementById(selectID);
    let selectParentNode = selectObj.parentNode;
    let newSelectObj = selectObj.cloneNode(false);
    newSelectObj.options.add(new Option("- choose a remote -", ""));
    for (let o in optionsList["remotes"])
    {
        let remote = optionsList["remotes"][o];
        let remoteText = remote;

        let availableDiskSpace = undefined;
        // try to get available disk space
        if (remotes[remote] !== undefined && remotes[remote]["canQueryDisk"] === true)
        {
            let params = {
                "fs": remote.concat(":/", remotes[remote]["pathToQueryDisk"])
            };
            sendRequestToRclone("/operations/about", params, function(rez)
            {
                availableDiskSpace = getHumanReadableValue(rez["free"], "");
                remoteText = remoteText.concat(` (${availableDiskSpace} left)`);
                newSelectObj.options.add(new Option(remoteText, remote));
            });
        }
        else
        {
            newSelectObj.options.add(new Option(remoteText, remote));
        }
    }
    selectParentNode.replaceChild(newSelectObj, selectObj);
}

function remoteChanged(remotesList, filesPanelID)
{
    let remote = remotesList.value;
    if (remote === "") { return; }

    openPath(
        remote.concat(
            ":/",
            remotes[remote] === undefined ? "" : remotes[remote]["startingFolder"]
        ),
        filesPanelID
    );
}

function openPath(path, filesPanelID)
{
    if (path.trim() === "") { return; }

    let filesPanel = document.getElementById(filesPanelID);
    while (filesPanel.firstChild) { filesPanel.removeChild(filesPanel.firstChild); }

    filesPanel.parentNode.parentNode.getElementsByClassName("filesCount")[0].textContent = "-";

    let lastSlash = path.lastIndexOf("/") + 1;
    let basePath = lastSlash !== 0 ? path.substring(0, lastSlash) : path.concat("/");
    //let currentPath = path.substring(firstSlash, path.length);
    let nextPath = lastSlash !== 0 ? path.substring(lastSlash, path.length) : "";

    panelsPaths[filesPanelID] = path;

    let div = ""
        .concat(`<div class='fileLine folderLine'
            onclick="openPath('${basePath.substring(0, lastSlash - 1).replace(/'/g, "\\'")}', '${filesPanelID}');">`)
        .concat("<img class='icon' src='", rcloneDir, "/images/file.svg' />")
        .concat("<p>..</p>")
        .concat("</div>");
    filesPanel.appendChild(htmlToElement(div));
    filesPanel.appendChild(htmlToElement("<div class='loadingAnimation'></div>"));
    let params = {
        "fs": basePath,
        "remote": nextPath
    };
    sendRequestToRclone("/operations/list", params, function(rez)
    {
        filesPanel.parentNode.parentNode.getElementsByClassName("loadingAnimation")[0].style.display = "none";

        if (rez === null)
        {
            console.error("Request returned a null value, looks like there is something wrong with the request");
            return;
        }

        listOfFilesAndFolders = rez["list"];
        listOfFilesAndFolders.sort(sortFilesAndFolders);
        filesPanel.parentNode.parentNode.getElementsByClassName("filesCount")[0].textContent = listOfFilesAndFolders.length;
        for (let r in listOfFilesAndFolders)
        {
            let fileName = listOfFilesAndFolders[r]["Name"];
            let fileNamePath = panelsPaths[filesPanelID].concat("/", fileName);

            let folderNamePath = basePath.concat(listOfFilesAndFolders[r]["Path"]);

            div = "<div class='file-list-item'><input type='checkbox' name='fileListItem' />";
            if (listOfFilesAndFolders[r]["IsDir"] === true)
            {
                div = div.concat(`<div class='fileLine folderLine'
                    data-type='folder' data-path="${folderNamePath}"
                    onclick="openPath('${folderNamePath.replace(/'/g, "\\'")}', '${filesPanelID}');">`
                )
            }
            else
            {
                div = div.concat(`<div class='fileLine' data-type='file' data-path="${fileNamePath}">`)
            }
            div = div.concat("<img class='icon' src='", rcloneDir , "/images/", getIconType(listOfFilesAndFolders[r]["MimeType"]), "' />")
                .concat("<p>", fileName, "</p>")
                .concat("</div></div>");
            filesPanel.appendChild(htmlToElement(div));
        }
    });
}

// Time Format Functions
const sec2time = (SEC) => {
    return (new Date( SEC * 1000).toISOString().substr(11,8));
}
const msec2time = (MSEC) => {
    return (new Date(MSEC).toISOString().substr(11,8));
}
function secondsToDhms(seconds) {
        seconds = Number(seconds);
        var d = Math.floor(seconds / (3600*24));
        var h = Math.floor(seconds % (3600*24) / 3600);
        var m = Math.floor(seconds % 3600 / 60);
        var s = Math.floor(seconds % 60);

        var dDisplay = d > 0 ? d + (d == 1 ? "J " : "J ") : "";
        var hDisplay = h > 0 ? h + (h == 1 ? "H " : "H ") : "";
        var mDisplay = m > 0 ? m + (m == 1 ? "M " : "M ") : "";
        var sDisplay = s > 0 ? s + (s == 1 ? "s" : "s") : "";
        return dDisplay + hDisplay + mDisplay + sDisplay;
}


function updateCurrentTransfers(currentTransfers)
{
    let currentTransfersBody = document.getElementById("currentTransfersBody");
    while (currentTransfersBody.firstChild)
    {
        currentTransfersBody.removeChild(currentTransfersBody.firstChild);
    }

    let addQueueElementsOnly = false;

    if (currentTransfers === undefined || !currentTransfers.length)
    {
        document.getElementById("currentTransfersCount").textContent = "0";

        if (!transfersQueue.length)
        {
            document.getElementById("currentTransfers").style.display = "none";
            return;
        }
        else { addQueueElementsOnly = true; }
    }

    if (!addQueueElementsOnly) // add items from current transfers list
    {
        document.getElementById("currentTransfersCount").textContent = currentTransfers.length;
        currentTransfers.sort(sortJobs);
        for (let t = 0; t < currentTransfers.length; t++)
        {
            let tr = `<tr>
                <td>${t + 1}</td>
                <td class="canBeLong">${currentTransfers[t]["name"]}</td>
                <td>${getHumanReadableValue(currentTransfers[t]["size"], "")}</td>
                <td>${getHumanReadableValue(parseFloat(currentTransfers[t]["speed"]).toFixed(), "/s")}</td>
                <td><progress value="${currentTransfers[t]["percentage"]}" max="100"></progress></td>
                <td><img src="${rcloneDir}/images/x-square.svg" onclick="cancelTransfer(this, '${currentTransfers[t]["group"]}');" /></td>
                </tr>`;
            currentTransfersBody.appendChild(htmlToElement(tr));
        }
    }
    // add items from the queue
    for (let q = 0; q < transfersQueue.length; q++)
    {
        let tr = `<tr style="font-style:italic;">
            <td><code>${transfersQueue[q].operationType}</code></td>
            <td colspan="4" class="canBeLong">${transfersQueue[q].dataPath}</td>
            <td><img src="${rcloneDir}/images/x-square.svg" onclick="removeFromQueue(this, ${q});" /></td>
            </tr>`;
        currentTransfersBody.appendChild(htmlToElement(tr));
    }
    document.getElementById("currentTransfers").style.display = "block";
}

function updateCompletedTransfers(completedTransfers)
{
    let completedTransfersBody = document.getElementById("completedTransfersBody");
    while (completedTransfersBody.firstChild)
    {
        completedTransfersBody.removeChild(completedTransfersBody.firstChild);
    }

    if (completedTransfers === undefined || !completedTransfers.length)
    {
        document.getElementById("completedTransfers").style.display = "none";
        document.getElementById("completedTransfersCount").textContent = "0";
        return;
    }

    let completedTransfersCount = 0;
    completedTransfers.sort(sortJobs).reverse();
    for (let t in completedTransfers)
    {
        // don't count checks as actual transfers
        if (completedTransfers[t]["checked"] === true) //|| completedTransfers[t]["bytes"] === 0)
        { continue; }

        completedTransfersCount++;

        let tr = `<tr>
            <td>${new Date(completedTransfers[t]["started_at"]).toLocaleString("en-GB")}</td>
            <td title="Start:${new Date(completedTransfers[t]["started_at"]).toLocaleString("en-GB")}\r\nEnd: ${new Date(completedTransfers[t]["completed_at"]).toLocaleString("en-GB")}">${ msec2time((new Date(completedTransfers[t]["completed_at"])) - (new Date(completedTransfers[t]["started_at"])))}</td>
            <td title="${completedTransfers[t]["error"]}" >${completedTransfers[t]["error"] === "" ? spanOK : spanFAIL}</td>
            <td class="canBeLong" title="${completedTransfers[t]["name"]}">${completedTransfers[t]["name"]}</td>
            <td>${getHumanReadableValue(completedTransfers[t]["size"], "")}</td>
            </tr>`;
        completedTransfersBody.appendChild(htmlToElement(tr));
    }
    document.getElementById("completedTransfersCount").textContent = completedTransfersCount;
    document.getElementById("completedTransfers").style.display = "block";
}

function refreshView()
{
    getCurrentTransfers();
    getCompletedTransfers();
    //refreshFilesListing();
}

function getCurrentTransfers()
{
    sendRequestToRclone("/core/stats", "", function(rez)
    {
        updateCurrentTransfers(rez["transferring"]);
        document.getElementById("statsElapsedTime").textContent = ( secondsToDhms(rez["elapsedTime"]));
        document.getElementById("statsTransferTime").textContent = ( secondsToDhms(rez["transferTime"]));
        document.getElementById("statsErrors").textContent = rez["errors"];
        document.getElementById("statsBytes").textContent = ( rez["bytes"] / 1000000000).toFixed(2) + " GB";
        document.getElementById("statsDeletes").textContent = rez["deletes"];
        document.getElementById("statsSpeed").textContent = (rez["speed"] / 1000000 ).toFixed(2) + " MB/s";
});
}

function getCompletedTransfers()
{
    sendRequestToRclone("/core/transferred", "", function(rez)
    {
        updateCompletedTransfers(rez["transferred"]);
    });
}

function refreshFilesListing()
{
    refreshClicked("leftPanelFiles");
    refreshClicked("rightPanelFiles");
}

function cancelTransfer(cancelBtn, groupID)
{
    cancelBtn.style.display = "none";

    let jobID = groupID.substring(
        groupID.lastIndexOf("/") + 1,
        groupID.length
    );
    let params = { "jobid": jobID };
    sendRequestToRclone("/job/stop", params, function(rez)
    {
        refreshView();
    });
}

function removeFromQueue(removeBtn, q)
{
    removeBtn.style.display = "none";
    transfersQueue.splice(q, 1);
}

function copyClicked(btn, filesPanelID)
{
    operationClicked(btn, "copy", filesPanelID);
}

function moveClicked(btn, filesPanelID)
{
    operationClicked(btn, "move", filesPanelID);
}

function deleteClicked(btn, filesPanelID)
{
    operationClicked(btn, "delete", filesPanelID);
}

function refreshClicked(filesPanelID)
{
    if (panelsPaths[filesPanelID] !== "")
    {
        openPath(panelsPaths[filesPanelID], filesPanelID);
    }
}

function operationClicked(btn, operationType, filesPanelID)
{
    if (operationType === "copy" || operationType === "move")
    {
        if (panelsPathsHaveValue() !== true)
        {
            alert("Cannot perform an operation when one of the panels does not have a remote chosen.");
            return;
        }
    }

    btn.disabled = true;
    setTimeout(function () { btn.disabled = false; }, 5000);

    addToQueue(operationType, filesPanelID);
}

function addToQueue(operationType, filesPanelID)
{
    let checkedBoxes = document.getElementById(filesPanelID)
        .querySelectorAll("input[name=fileListItem]:checked");
    for (let i = 0; i < checkedBoxes.length; i++)
    {
        let dataPath = checkedBoxes[i].nextElementSibling.dataset.path;
        let lastSlash = dataPath.lastIndexOf("/") + 1;
        let sourcePath = dataPath.substring(0, lastSlash);
        let targetPath = dataPath.substring(lastSlash, dataPath.length);
        let dataType = checkedBoxes[i].nextElementSibling.dataset.type;

        transfersQueue.push(
            {
                "dtAdded": new Date(),
                "operationType": operationType,
                "dataType": dataType,
                "dataPath": dataPath,
                "sourcePath": sourcePath,
                "targetPath": targetPath,
                "dstFS": dataType === "folder"
                    ? getDestinationPath(filesPanelID).concat("/", targetPath)
                    : getDestinationPath(filesPanelID).concat("/"),
                "filesPanelID": filesPanelID
            }
        );
        checkedBoxes[i].checked = false;
    }
}

function processQueue()
{
    if ( // the queue is empty or of there already are active transfers
        document.getElementById("currentTransfersCount").textContent !== "0"
        || !transfersQueue.length
    ) { return; }

    let firstItemFromQueue = transfersQueue.splice(0, 1)[0];

    switch (firstItemFromQueue.operationType)
    {
        case "copy":
        case "move":
            copyOrMoveOperation(
                firstItemFromQueue.operationType,
                firstItemFromQueue.dataType,
                firstItemFromQueue.dataPath,
                firstItemFromQueue.sourcePath,
                firstItemFromQueue.targetPath,
                firstItemFromQueue.dstFS,
                firstItemFromQueue.filesPanelID
                );
            break;
        case "delete":
            deleteOperation(
                firstItemFromQueue.operationType,
                firstItemFromQueue.dataType,
                firstItemFromQueue.sourcePath,
                firstItemFromQueue.targetPath,
                firstItemFromQueue.filesPanelID
                );
            break;
        default:
            console.error(`Unknown operation type: ${operationType}`);
    }
}

function copyOrMoveOperation(operationType, dataType, dataPath, sourcePath, targetPath, dstFS, filesPanelID)
{
    let panelToUpdate = filesPanelID === "leftPanelFiles" ? "rightPanelFiles" : "leftPanelFiles";

    if (dataType === "folder")
    {
        let params = {
            "srcFs": dataPath,
            "dstFs": dstFS
        };
        if (operationType === "move")
        {
            params["deleteEmptySrcDirs"] = "true";
        }
        let folderOperation = getFolderOperation(operationType);
        if (folderOperation === "")
        {
            console.error(`Unknown operation type: ${operationType}`);
        }
        sendRequestToRclone(folderOperation, params, function(rez)
        {
        });
    }
    else
    {
        let params = {
            "srcFs": sourcePath,
            "srcRemote": targetPath,
            "dstFs": dstFS,
            "dstRemote": targetPath
        };
        let fileOperation = getFileOperation(operationType);
        if (fileOperation === "")
        {
            console.error(`Unknown operation type: ${operationType}`);
        }
        sendRequestToRclone(fileOperation, params, function(rez)
        {
        });
    }
}

function deleteOperation(operationType, dataType, sourcePath, targetPath, filesPanelID)
{
    let params = {
        "fs": sourcePath,
        "remote": targetPath
    };

    let folderOperation = dataType === "folder"
        ? getFolderOperation(operationType)
        : getFileOperation(operationType);
    if (folderOperation === "")
    {
        console.error(`Unknown operation type: ${operationType}`);
    }
    sendRequestToRclone(folderOperation, params, function(rez)
    {
    });
}

function showCreateFolder(btn)
{
    let panelDiv = btn.parentNode.parentNode.parentNode;
    panelDiv.querySelector(".controls").style.display = "none";
    panelDiv.querySelector(".create-folder").style.display = "flex";
}

function hideCreateFolder(btn)
{
    let panelDiv = btn.parentNode.parentNode;
    panelDiv.querySelector(".create-folder").style.display = "none";
    panelDiv.querySelector(".controls").style.display = "flex";
}

function createFolderClicked(btn, filesPanelID)
{
    let currentPath = panelsPaths[filesPanelID];
    if (currentPath !== "")
    {
        let folderName = btn.parentNode.querySelector("input").value.trim();
        if (!folderName)
        {
            alert("A folder has no name.");
            return;
        }

        btn.style.display = "none";

        let lastSlash = currentPath.lastIndexOf("/") + 1;
        let basePath = lastSlash !== 0 ? currentPath.substring(0, lastSlash) : currentPath.concat("/");
        let targetPath = currentPath.substring(lastSlash, currentPath.length).concat("/", folderName);
        console.debug(currentPath, basePath, targetPath);

        let params = {
            "fs": currentPath,
            "remote": folderName
        };
        sendRequestToRclone("/operations/mkdir", params, function(rez)
        {
            btn.style.display = "block";
            if (rez === null)
            {
                console.error("Request returned a null value, looks like there is something wrong with the request");
                return;
            }
            else
            {
                hideCreateFolder(btn);
                refreshClicked(filesPanelID);
            }
        });
    }
    else
    {
        alert("Cannot create a folder in nowhere. Choose a remote first.");
        return;
    }
}
