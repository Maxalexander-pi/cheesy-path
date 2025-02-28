let waypoints = [];
let splinePoints = [];
let fieldCanvas;
let ctx;
let ctxBackground;
let image;
let wto;
let change = "propertychange change input";
let animating = false;
let waypointsOutput;
let waypointsDialog;
let titleInput;
let interactive;
let clipboardToast;
let isReversedCheckbox;

const fieldWidth = 624; // inches
const fieldHeight = 315; // inches

const xOffset = 0; // inches
const yOffset = 0; // inches

const width = 980; //pixels
const height = 513; //pixels

const robotWidth = 34; // inches
const robotHeight = 34; // inches

const waypointRadius = 7;
const splineWidth = 3;

const kEps = 1E-9;
const pi = Math.PI;

const Colors = {
    LIME_GREEN: "#2CFF2C",
    LIGHT_BLUE: "#00AAFF",
    DARK_BLUE: "#0066FF",
}

const { calcSplines } = window['splines-kt'];

const {
    Pose2d,
    Rotation2d,
    Rotation2d_fromDegrees,
    Rotation2d_fromRadians,
    Translation2d
} = window['splines-kt'].com.team254.lib.geometry;

// Client-side class extensions

Rotation2d.fromDegrees = Rotation2d_fromDegrees;
Rotation2d.fromRadians = Rotation2d_fromRadians;

Object.defineProperties(Translation2d.prototype, {
    drawX: {
        get() {
            return (this._x + xOffset) * (width / fieldWidth);
        }
    },
    drawY: {
        get() {
            return height - (this._y + yOffset) * (height / fieldHeight);
        }
    },
});

function svg(tagName, attrs) {
    const svgNs = "http://www.w3.org/2000/svg";
    let element = document.createElementNS(svgNs, tagName);
    if (attrs && typeof attrs === 'object') {
        for (const [key, value] of Object.entries(attrs)) {
            element.setAttribute(key, value);
        }
    }
    return element;
}

function d2r(d) {
    return d * (Math.PI / 180);
}

function r2d(r) {
    return r * (180 / Math.PI);
}

function fillRobot(position, heading, color) {
    let previous = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "destination-over";

    let translation = position.translation;

    ctx.translate(translation.drawX, translation.drawY);
    ctx.rotate(-heading);

    let w = robotWidth * (width / fieldWidth);
    let h = robotHeight * (height / fieldHeight);
    ctx.fillStyle = color || "rgba(0, 0, 0, 0)";
    ctx.fillRect(-h / 2, -w / 2, h, w);

    ctx.rotate(heading);
    ctx.translate(-translation.drawX, -translation.drawY);

    ctx.globalCompositeOperation = previous;
}

let r = Math.sqrt(Math.pow(robotWidth, 2) + Math.pow(robotHeight, 2)) / 2;
let t = Math.atan2(robotHeight, robotWidth);

function drawRobot(position, heading) {
    let h = heading;
    let angles = [h + (pi / 2) + t, h - (pi / 2) + t, h + (pi / 2) - t, h - (pi / 2) - t];

    let points = [];

    angles.forEach(function(angle) {
        const point = new Translation2d(position.translation._x + (r * Math.cos(angle)),
            position.translation._y + (r * Math.sin(angle)));
        points.push(point);
        drawPoint(
            point,
            {
                color: Math.abs(angle - heading) < pi / 2 ? Colors.LIGHT_BLUE : Colors.DARK_BLUE,
                radius: splineWidth
            }
        );
    });
}

function drawPoint(point, { color = Colors.LIME_GREEN, radius }) {
    ctx.beginPath();
    ctx.arc(point.drawX, point.drawY, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.fill();
    ctx.lineWidth = 0;
    ctx.stroke();
}

function fixWidthHelper(e, ui) {
    ui.children().each(function() {
        $(this).width($(this).width());
    });
    return ui;
}

function init() {
    let field = $('#field');
    let background = $('#background');
    let canvases = $('#canvases');
    let interactiveEl = $('#interactive');
    let widthString = (width / 1.5) + "px";
    let heightString = (height / 1.5) + "px";

	field.css("width", widthString);
    field.css("height", heightString);
    background.css("width", widthString);
    background.css("height", heightString);
    interactiveEl.css("width", widthString);
    interactiveEl.css("height", heightString);
    canvases.css("width", widthString);
    canvases.css("height", heightString);
    fieldCanvas = document.getElementById('field');

	ctx = fieldCanvas.getContext('2d');
	ctx.canvas.width = width;
	ctx.canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#FF0000";

    ctxBackground = document.getElementById('background').getContext('2d');
    ctxBackground.canvas.width = width;
    ctxBackground.canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    interactive = document.getElementById('interactive');
    interactive.setAttribute("width", width);
    interactive.setAttribute("height", height);
    interactive.setAttribute("viewBox", `0 0 ${width} ${height}`);
    interactive.addEventListener('click', onCanvasClick);

	image = new Image();
	image.src = 'resources/img/season.jpg';
	image.onload = function() {
		ctxBackground.drawImage(image, 0, 0, width, height);
		update(false);
	};

	titleInput = document.getElementById("title");

    isReversedCheckbox = document.getElementById('isReversed');
    waypointsDialog = document.getElementById('waypointsDialog');
    waypointsOutput = document.getElementById('waypointsOutput');
    clipboardToast = document.getElementById('clipboardToast');

    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveFile();
        }
    })

    $('table tbody').sortable({
        helper: fixWidthHelper,
        update: update,
        forcePlaceholderSize: true,
    }).disableSelection();

    rebind();
}

function clearSplines() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#FF0000";
}

function clear() {
    clearSplines();

	ctxBackground.clearRect(0, 0, width, height);
    ctxBackground.fillStyle = "#FF0000";
    ctxBackground.drawImage(image, 0, 0, width, height);

    while (interactive.lastChild) {
        interactive.removeChild(interactive.lastChild);
    }
}

function rebind() {
    let input = $('.data-input');
    input.unbind(change);
    input.bind(change, function() {
        cancelAnimationFrame(wto);
        wto = requestAnimationFrame(function() {
            update();
        });
    });
}

function addPoint() {
	let prev;
	if (waypoints.length > 0) prev = waypoints[waypoints.length - 1].translation;
	else prev = new Translation2d(50, 50);
	_addPoint(prev.x + 50, prev.y + 50);
}

function _addPoint(x, y, heading = 0, doUpdate = true) {
    $("tbody").append("<tr>" + "<td class='drag-handler'><i class='material-icons'>drag_indicator</i></td>"
        + `<td class='x'><input type='number' class='data-input' value='${x}'></td>`
        + `<td class='y'><input type='number' class='data-input' value='${y}'></td>`
        + `<td class='heading'><input type='number' class='data-input' value='${heading}'></td>`
        + "<td class='comments'><input type='search' placeholder='Comments'></td>"
        + "<td class='enabled'><input type='checkbox' class='data-input' checked></td>"
        + "<td class='delete'><button onclick='$(this).parent().parent().remove();update()' class='icon-button'><i class='material-icons'>clear</i></button></td></tr>");
    if (doUpdate) {
        update();
        rebind();
    }
}

function getCursorPosition(event) {
    const rect = interactive.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (width / rect.width),
        y: (event.clientY - rect.top) * (height / rect.height),
    };
}

function onCanvasClick(event) {
    let { x: canvasX, y: canvasY } = getCursorPosition(event);
    let { x, y } = canvasToFieldCoords(canvasX, canvasY);
    _addPoint(x, y);
}

function canvasToFieldCoords(canvasX, canvasY) {
    let x = Math.round(canvasX * (fieldWidth / width) - xOffset);
    let y = Math.round((height - canvasY) * (fieldHeight / height) - yOffset);
    return { x, y };
}

let selectedWaypoint;
function selectWaypoint(el) {
    if (el === selectedWaypoint) return;
    if (selectedWaypoint) {
        selectedWaypoint.removeAttribute('data-selected');
    }
    selectedWaypoint = el;
    if (selectedWaypoint) {
        selectedWaypoint.setAttribute('data-selected', true);
    }
}

function handleWaypointDragStart(event) {
    selectWaypoint(event.target);
    fieldCanvas.classList.add('faded');
    interactive.addEventListener('mousemove', handleWaypointDrag);
    interactive.addEventListener('mouseup', handleWaypointDragEnd);
}

function handleWaypointDrag(event) {
    if (selectedWaypoint) {
        event.preventDefault();
        let { x: canvasX, y: canvasY } = getCursorPosition(event);
        selectedWaypoint.setAttribute("cx", canvasX);
        selectedWaypoint.setAttribute("cy", canvasY);
        let index = selectedWaypoint.getAttribute('data-index');
        let { x, y } = canvasToFieldCoords(canvasX, canvasY);
        waypoints[index].translation._x = x;
        waypoints[index].translation._y = y;

        recalculateSplines(waypoints, 4);
    }
}

function handleWaypointClick(event) {
    event.stopPropagation();
}

function handleWaypointDragEnd(event) {
    if (selectedWaypoint) {
        let { x: canvasX, y: canvasY } = getCursorPosition(event);
        let { x, y } = canvasToFieldCoords(canvasX, canvasY);
        modifyWaypoint(selectedWaypoint.getAttribute('data-index'), x, y);
        selectWaypoint(null);
    }
    fieldCanvas.classList.remove('faded');
    interactive.removeEventListener('mousemove', handleWaypointDrag);
    interactive.removeEventListener('mouseup', handleWaypointDragEnd);
}

function modifyWaypoint(index, x, y) {
    let tr = $('tbody').children('tr')[index];
    let xInput = tr.querySelector('.x input');
    let yInput = tr.querySelector('.y input');

    xInput.value = x;
    yInput.value = y;

    update();
    rebind();
}

function draw(style) {
    if (style === 4) {
        clearSplines();
        drawSplines(true);
        drawSplines(false);
        return;
    }
    clear();
    drawWaypoints();

    switch (style) {
        // waypoints only
        case 1:
            break;
        // all
        case 2:
            drawSplines(true);
            drawSplines(false);
            break;
        case 3:
            animate();
            break;
    }
}

function update(modified = true) {
    if (animating) {
        return;
    }

	waypoints = [];
	let data = "";
	$('tbody').children('tr').each(function() {
		let x = parseInt($($($(this).children()).children()[1]).val());
		let y = parseInt($($($(this).children()).children()[2]).val());
		let heading = Math.round(parseInt($($($(this).children()).children()[3]).val()));
		if (isNaN(heading)) {
			heading = 0;
        }
		let comment = ($($($(this).children()).children()[4]).val());
        let enabled = ($($($(this).children()).children()[5]).prop('checked'));
		if (enabled) {
            waypoints.push(new Pose2d(new Translation2d(x, y), Rotation2d.fromDegrees(heading), comment));
        }
    });

    draw(1);

    if (modified) {
        setModified(true);
    }

    recalculateSplines(waypoints, 2);
}

// const worker = new Worker('/resources/js/worker.js');

// Type information / object prototypes are lost in postMessage
function deserializePoints(serializedPoints) {
    return serializedPoints.map(p =>
        new Pose2d(
            new Translation2d(p._translation_._x, p._translation_._y),
            new Rotation2d(p._rotation_._cos_angle_, p._rotation_._sin_angle)
        )
    );
}

function calculateAndParseSplines(inputPoints) {
    const splineData = calcSplines(inputPoints);
    if (splineData === 'no') return [];
    let points = JSON.parse(splineData).points;
    let result = [];
    for (const point of points) {
        result.push(new Pose2d(new Translation2d(point.x, point.y), Rotation2d_fromRadians(point.rotation)));
    }
    return result;
}

function recalculateSplines(waypointsList, drawStyle) {
    const orderedWaypoints = isReversedCheckbox.checked ? waypointsList.slice(0).reverse() : waypointsList;
    const data = orderedWaypoints.map(point => (
        `${point.translation.x},${point.translation.y},${Math.round(point.rotation.degrees)}`
    )).join(';');

    if (data.length !== 0) {
        splinePoints = calculateAndParseSplines(orderedWaypoints);
        draw(drawStyle);
    }
}

function changeField(val) {
    console.log(val);
	image.src = `resources/img/${val}.jpg`
    image.onload(() => {
        ctx.drawImage(image, 0, 0, width, height);
        update(false);
    });
}

function drawWaypoints() {
	waypoints.forEach((waypoint, i) => {
        drawInteractivePoint(waypoint, waypointRadius, i);
        drawRobot(waypoint, waypoint.rotation.radians);
    });
}

function drawInteractivePoint(waypoint, radius, index) {
    let point = svg('circle', {
        fill: Colors.LIME_GREEN,
        cx: waypoint.translation.drawX,
        cy: waypoint.translation.drawY,
        r: radius,
        'data-index': index,
    });

    point.addEventListener('mousedown', handleWaypointDragStart);
    point.addEventListener('click', handleWaypointClick);

    interactive.appendChild(point);
}

let animation;

function animate() {
    drawSplines(false, true);
}

function drawSplines(fill, animate) {
    animate = animate || false;
    let i = 0;

    if (animate) {
        let requestId;
        cancelAnimationFrame(animation);

        function animLoop() {
            if (i === splinePoints.length) {
                animating = false;
                cancelAnimationFrame(animation);
                return;
            }

            animating = true;

            let splinePoint = splinePoints[i];
            let hue = Math.round(180 * (i++ / splinePoints.length));

            let previous = ctx.globalCompositeOperation;
            fillRobot(splinePoint, splinePoint.rotation.radians, 'hsla(' + hue + ', 100%, 50%, 0.025)');
            ctx.globalCompositeOperation = "source-over";
            drawRobot(splinePoint, splinePoint.rotation.radians);
            drawPoint(splinePoint.translation, { radius: splineWidth });
            ctx.globalCompositeOperation = previous;

            animation = requestAnimationFrame(animLoop);
        }
        animation = requestAnimationFrame(animLoop)
    } else {
        splinePoints.forEach((splinePoint) => {
            drawPoint(splinePoint.translation, { radius: splineWidth });

            if (fill) {
                let index = isReversedCheckbox.checked ? (splinePoints.length - i++) : i++;
                let hue = Math.round(180 * (index / splinePoints.length));
                fillRobot(splinePoint, splinePoint.rotation.radians, 'hsla(' + hue + ', 100%, 50%, 0.025)');
            } else {
                drawRobot(splinePoint, splinePoint.rotation.radians);
            }
        });
    }
}

function showWaypointsList() {
    waypointsOutput.textContent = generateWaypointsList();
    waypointsDialog.showModal();
}

async function copyToClipboard() {
    let range = new Range();
    range.selectNode(waypointsOutput);
    window.getSelection().empty();
    window.getSelection().addRange(range);
    await navigator.clipboard.writeText(waypointsOutput.textContent);
    showToast(clipboardToast);
}

const TOAST_DURATION = 1000; // ms

function showToast(toastEl) {
    toastEl.classList.add('shown');
    setTimeout(() => {
        toastEl.classList.remove('shown');
    }, TOAST_DURATION);
}

function generateWaypointsList() {
    console.log(waypoints[0].comment);
    return 'List.of(\n' +
        waypoints.map((waypoint, i, arr) =>
            `\tnew Pose2d(${waypoint.translation.x()}, ${waypoint.translation.y()}, ${Math.round(waypoint.rotation.degrees)})`
            + (i === arr.length - 1 ? '' : ',')
            + (waypoint.comment ? ` // ${waypoint.comment}` : '')
        ).join('\n') +
        '\n)';
}

function loadWaypoints(data) {
    waypoints = [];
    $('tbody').empty();
    for (const {x, y, heading} of data) {
        _addPoint(x, y, heading, false);
    }
    update(false);
    rebind();
}

class CSV {
    constructor(data = [], isReversed) {
        this.data = data;
        this.isReversed = isReversed;
    }

    static load(text) {
        const rows = text.split("\n");
        const headers = rows.shift(); // gets and removes headers
        const reversedText = headers.split(',')[3]?.trim();
        const reversed = !!(reversedText && reversedText === 'true'); // ignore truthy values, explicit true
        const data = rows.map(row => {
            const [ x, y, heading ] = row.split(",");
            return { x, y, heading };
        });
        return new CSV(data, reversed);
    }

    addRow({ x, y, heading }) {
        this.data.push({ x, y, heading });
    }

    toString() {
        let returnVal = `x,y,heading,${this.isReversed}\n`;
        returnVal += this.data.map(({x, y, heading}) => `${x},${y},${heading}`).join('\n');
        return returnVal;
    }

    toBlob() {
        return new Blob([this.toString()], { type: 'text/csv' });
    }
}

function setModified(modified) {
    if (modified) {
        document.documentElement.setAttribute('data-modified', 'true');
    } else {
        document.documentElement.removeAttribute('data-modified');
    }
}

const filePickerOptions = {
    types: [
        {
            description: 'CSV Files',
            accept: {
                'text/csv': ['.csv'],
            },
        },
    ],
};
let fileHandle;

async function openFile() {
    [fileHandle] = await window.showOpenFilePicker(filePickerOptions);
    const file = await fileHandle.getFile();
    await loadFromFile(file);
}

async function restoreFromFile() {
    if (fileHandle) {
        const file = await fileHandle.getFile();
        await loadFromFile(file);
    }
}

async function loadFromFile(file) {
    titleInput.value = file.name.slice(0, -4);
    const text = await file.text();
    const output = CSV.load(text);
    isReversedCheckbox.checked = output.isReversed;
    loadWaypoints(output.data);
}

async function writeFile(fileHandle, contents) {
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
}

function generateCSV() {
    const csv = new CSV(
        waypoints.map(point => ({
            x: point.translation._x,
            y: point.translation._y,
            heading: Math.round(point.rotation.degrees),
        })),
        isReversedCheckbox.checked
    );
    return csv.toString();
}

async function saveFile() {
    try {
        if (!fileHandle) {
            return await saveFileAs();
        }
        await writeFile(fileHandle, generateCSV());
    } catch (e) {
        console.error('Unable to save file', e);
    }
    setModified(false);
}

async function saveFileAs() {
    try {
        fileHandle = await window.showSaveFilePicker(filePickerOptions);
        titleInput.value = fileHandle.name.slice(0, -4);
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('An error occurred trying to open the file', e);
        return;
    }
    try {
        await writeFile(fileHandle, generateCSV());
    } catch (e) {
        console.error('Unable to save file', e);
    }
    setModified(false);
}
