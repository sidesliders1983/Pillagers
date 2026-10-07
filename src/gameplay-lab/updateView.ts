/** Update the view in place so native controls keep focus and open menus. */
export function updateView(root:HTMLElement,html:string,preservedFields:ReadonlySet<string>=new Set()):void {
    const template=document.createElement('template');template.innerHTML=html;
    const key=(node:Node):string|null=>node instanceof Element?node.id||node.getAttribute('data-view-key'):null;
    const compatible=(a:Node,b:Node)=>a.nodeType===b.nodeType&&(!(a instanceof Element)||b instanceof Element&&a.tagName===b.tagName)&&key(a)===key(b);
    const patch=(current:Node,next:Node):void=>{
        if(current instanceof Element&&next instanceof Element){
            for(const attribute of Array.from(current.attributes)){
                if(attribute.name==='open'&&current instanceof HTMLDetailsElement)continue;
                if(!next.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
            }
            for(const attribute of Array.from(next.attributes)){
                if(attribute.name==='selected'&&current instanceof HTMLOptionElement)continue;
                if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
            }
            children(current,next);
            if(!preservedFields.has(current.id)){
                if(current instanceof HTMLSelectElement&&next instanceof HTMLSelectElement&&current.value!==next.value)current.value=next.value;
                if(current instanceof HTMLInputElement&&next instanceof HTMLInputElement&&current.type!=='file'){
                    if(current.value!==next.value)current.value=next.value;
                    if(current.type==='checkbox'&&current.checked!==next.checked)current.checked=next.checked;
                }
            }
        }else if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;
    };
    const children=(current:Node,next:Node):void=>{
        let cursor:Node|null=current.firstChild;
        for(const desired of Array.from(next.childNodes)){
            let match:Node|null=cursor;
            if(!match||!compatible(match,desired)){
                match=key(desired)?Array.from(current.childNodes).find(node=>compatible(node,desired))??null:null;
                if(match)current.insertBefore(match,cursor);
                else {match=desired.cloneNode(true);current.insertBefore(match,cursor);}
            }
            patch(match,desired);cursor=match.nextSibling;
        }
        while(cursor){const following=cursor.nextSibling;current.removeChild(cursor);cursor=following;}
    };
    children(root,template.content);
}
