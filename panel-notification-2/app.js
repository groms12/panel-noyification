const board = document.querySelector('#board');
const columns = [...board.querySelectorAll('.column')];
const orders = columns.map(column => [...column.querySelectorAll('.card')]);
const placeholder = document.querySelector('#drop-placeholder');
const layoutStorageKey = 'bettera-client-board-v1';
let filter = '', status = '', reverse = new Set();
let draggedId = null, dropBefore = null, dropStage = null;

const allCards = () => orders.flat();
const stageOf = card => orders.findIndex(list => list.includes(card));
const nameOf = card => card.querySelector('h3').textContent;
const phoneOf = card => card.querySelector('.phone').textContent;
const ownerOf = card => card.querySelector('.owner strong').textContent;
const inverted = stage => reverse.has(stage) || document.querySelector('#date').value === 'desc';

function updateBoard() {
    document.querySelector('#clear-search').hidden = document.querySelector('#search').value.length === 0;
    const query = document.querySelector('#search').value.toLowerCase().replace(/\s/g, '');
    const owner = document.querySelector('#owner').value;
    const city = document.querySelector('#rfo').value;
    let visible = 0;
    orders.forEach((list, stage) => {
        const displayed = inverted(stage) ? [...list].reverse() : list;
        displayed.forEach(card => {
            columns[stage].querySelector('.cards').append(card);
            const hasTask = Boolean(card.querySelector('.task').textContent.trim());
            card.hidden = !(
                (nameOf(card) + phoneOf(card)).toLowerCase().replace(/\s/g, '').includes(query) &&
                (!owner || ownerOf(card) === owner) && (!city || card.dataset.city === city) &&
                (!status || card.dataset.status === status) &&
                (!(filter === 'attention' || document.querySelector('#scope').value === 'attention') || card.dataset.attention === 'true') &&
                (filter !== 'mine' || ownerOf(card) === 'Усович В.О') &&
                (filter !== 'office' || stage >= 3) &&
                (filter !== 'city' || card.dataset.city === 'Москва') &&
                (filter !== 'no-task' || !hasTask)
            );
            if (!card.hidden) visible++;
        });
    });
    document.querySelector('#empty').hidden = visible > 0;
}

function saveLayout() {
    try {
        localStorage.setItem(layoutStorageKey, JSON.stringify({
            cards: orders.flatMap((list, stage) => list.map(card => ({
                id: Number(card.dataset.id), stage, name: nameOf(card), phone: phoneOf(card), owner: ownerOf(card)
            }))),
            reverse: [...reverse], dateOrder: document.querySelector('#date').value
        }));
    } catch (error) { console.warn('Не удалось сохранить расположение карточек:', error); }
}

function visitorCard(entry) {
    const card = document.querySelector('#visitor-template').content.firstElementChild.cloneNode(true);
    card.dataset.id = entry.id;
    card.querySelector('h3').textContent = entry.name;
    card.querySelector('.phone').textContent = entry.phone;
    card.querySelector('.owner strong').textContent = entry.owner;
    card.setAttribute('aria-label', `Карточка: ${entry.name}`);
    return card;
}

function changeCount(stage, delta) {
    const count = columns[stage].querySelector('.count');
    count.textContent = Math.max(0, Number(count.textContent) + delta);
}

function restoreLayout() {
    try {
        const saved = JSON.parse(localStorage.getItem(layoutStorageKey));
        if (!saved || !Array.isArray(saved.cards)) return;
        const originals = new Map(allCards().map(card => [Number(card.dataset.id), card]));
        const initialCounts = orders.map(list => list.length);
        const restored = columns.map(() => []), seen = new Set();
        saved.cards.forEach(entry => {
            if (!Number.isSafeInteger(entry.id) || entry.id < 0 || seen.has(entry.id) ||
                !Number.isInteger(entry.stage) || entry.stage < 0 || entry.stage >= columns.length) return;
            let card = originals.get(entry.id);
            if (!card) {
                if (!['name', 'phone', 'owner'].every(key => typeof entry[key] === 'string')) return;
                card = visitorCard(entry);
            }
            restored[entry.stage].push(card);
            seen.add(entry.id);
        });
        orders.forEach((list, stage) => list.forEach(card => {
            if (!seen.has(Number(card.dataset.id))) restored[stage].push(card);
        }));
        restored.forEach((list, stage) => {
            orders[stage] = list;
            changeCount(stage, list.length - initialCounts[stage]);
        });
        if (Array.isArray(saved.reverse)) reverse = new Set(saved.reverse.filter(stage => Number.isInteger(stage) && stage >= 0 && stage < columns.length));
        if (['', 'asc', 'desc'].includes(saved.dateOrder)) document.querySelector('#date').value = saved.dateOrder;
    } catch (error) { console.warn('Не удалось восстановить расположение карточек:', error); }
}

function updateFilters() {
    document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', filter === button.dataset.filter));
    document.querySelector('#attention').setAttribute('aria-pressed', filter === 'attention');
}

function openCard(card) {
    const details = document.querySelector('#client-details');
    const field = name => details.querySelector(`[data-detail="${name}"]`);
    field('name').textContent = nameOf(card);
    field('phone').textContent = phoneOf(card);
    field('phone').href = `tel:${phoneOf(card).replace(/[^+\d]/g, '')}`;
    field('owner').textContent = ownerOf(card);
    field('city').textContent = card.dataset.city;
    field('city-row').hidden = !card.dataset.city;
    field('task').textContent = card.querySelector('.task').innerText;
    field('note').textContent = card.querySelector('.note')?.textContent || '';
    field('note').hidden = !field('note').textContent;
    field('date').textContent = card.querySelector('.date-value').textContent.trim().split(' ')[0];
    document.querySelector('#client-dialog').showModal();
}

function clearDrop() {
    placeholder.hidden = true;
    document.body.append(placeholder);
    board.querySelectorAll('.drop-target,.dragging').forEach(element => element.classList.remove('drop-target', 'dragging'));
    dropBefore = null;
    dropStage = null;
}

function moveCard(id, stage, beforeId = null) {
    const card = allCards().find(card => Number(card.dataset.id) === id);
    const oldStage = stageOf(card);
    if (!card || stage < oldStage || stage >= columns.length || beforeId === id) return;
    orders[oldStage].splice(orders[oldStage].indexOf(card), 1);
    const list = orders[stage];
    let position = beforeId === null ? (inverted(stage) ? 0 : list.length) : list.findIndex(card => Number(card.dataset.id) === beforeId) + (inverted(stage) ? 1 : 0);
    list.splice(position < 0 ? list.length : position, 0, card);
    if (oldStage !== stage) { changeCount(oldStage, -1); changeCount(stage, 1); }
    updateBoard();
    saveLayout();
    card.focus({ preventScroll: true });
}

function previewDrop(event) {
    if (draggedId === null) return;
    const column = event.target.closest('.column');
    const card = allCards().find(card => Number(card.dataset.id) === draggedId);
    if (!column || !card || Number(column.dataset.stage) < stageOf(card)) {
        event.dataTransfer.dropEffect = 'none';
        clearDrop();
        return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    board.querySelectorAll('.drop-target').forEach(element => element.classList.remove('drop-target'));
    column.classList.add('drop-target');
    const container = column.querySelector('.cards');
    const next = [...container.querySelectorAll('.card')].filter(element => !element.hidden && Number(element.dataset.id) !== draggedId).find(element => {
        const bounds = element.getBoundingClientRect();
        return event.clientY < bounds.top + bounds.height / 2;
    });
    dropStage = Number(column.dataset.stage);
    dropBefore = next ? Number(next.dataset.id) : null;
    placeholder.hidden = false;
    container.insertBefore(placeholder, next || null);
    const bounds = board.getBoundingClientRect();
    if (event.clientX > bounds.right - 65) board.scrollLeft += 22;
    else if (event.clientX < bounds.left + 65) board.scrollLeft -= 22;
}

document.querySelector('#search').addEventListener('input', updateBoard);
document.querySelector('#clear-search').addEventListener('click', () => {
    const search = document.querySelector('#search');
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.focus();
});
['scope', 'owner', 'rfo', 'date'].forEach(id => document.getElementById(id).addEventListener('change', () => {
    updateBoard();
    if (id === 'date') saveLayout();
}));
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = filter === button.dataset.filter ? '' : button.dataset.filter;
    updateFilters();
    updateBoard();
}));
document.querySelector('#attention').addEventListener('click', () => {
    filter = filter === 'attention' ? '' : 'attention';
    updateFilters();
    updateBoard();
});
document.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => {
    status = status === button.dataset.status ? '' : button.dataset.status;
    document.querySelectorAll('[data-status]').forEach(element => element.classList.toggle('active', element.dataset.status === status));
    updateBoard();
}));
board.addEventListener('click', event => {
    const sort = event.target.closest('[data-sort]');
    if (sort) {
        const stage = Number(sort.dataset.sort);
        reverse.has(stage) ? reverse.delete(stage) : reverse.add(stage);
        updateBoard();
        saveLayout();
        return;
    }
    if (event.target.closest('#add-visitor')) { document.querySelector('#add-dialog').showModal(); return; }
    const card = event.target.closest('.card');
    if (card) openCard(card);
});
board.addEventListener('keydown', event => {
    const card = event.target.closest('.card');
    if (!card || event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCard(card); return; }
    if (!event.altKey) return;
    const id = Number(card.dataset.id), stage = stageOf(card);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        moveCard(id, stage + (event.key === 'ArrowRight' ? 1 : -1));
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const siblings = [...card.parentElement.querySelectorAll('.card')].filter(element => !element.hidden);
        const index = siblings.indexOf(card);
        if (event.key === 'ArrowUp' && index > 0) moveCard(id, stage, Number(siblings[index - 1].dataset.id));
        if (event.key === 'ArrowDown' && index < siblings.length - 1) moveCard(id, stage, siblings[index + 2] ? Number(siblings[index + 2].dataset.id) : null);
    }
});
document.querySelector('#close-add').addEventListener('click', () => document.querySelector('#add-dialog').close());
document.querySelector('#add-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    orders[5].push(visitorCard({
        id: Math.max(-1, ...allCards().map(card => Number(card.dataset.id))) + 1,
        name: data.get('name'), phone: data.get('phone'), owner: data.get('owner')
    }));
    changeCount(5, 1);
    document.querySelector('#add-dialog').close();
    event.target.reset();
    updateBoard();
    saveLayout();
});
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
}));
board.addEventListener('dragstart', event => {
    const card = event.target.closest('.card');
    if (!card) return;
    draggedId = Number(card.dataset.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(draggedId));
    card.classList.add('dragging');
});
board.addEventListener('dragover', previewDrop);
board.addEventListener('dragenter', previewDrop);
board.addEventListener('drop', event => {
    if (draggedId === null) return;
    previewDrop(event);
    if (dropStage === null) return;
    event.preventDefault();
    const id = draggedId, stage = dropStage, before = dropBefore;
    draggedId = null;
    clearDrop();
    moveCard(id, stage, before);
});
board.addEventListener('dragend', () => { draggedId = null; clearDrop(); });
restoreLayout();
updateBoard();
