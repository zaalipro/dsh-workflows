/** Allocate aliases in UTF-16 name order without stealing a sibling's bare name. */
export function allocateWorkflowCommandNames(definitions, occupiedNames) {
    const allocated = new Map();
    const reservedBareNames = new Set(definitions.map(definition => definition.name));
    const used = new Set();
    const sortedNames = [...reservedBareNames].sort();
    for (const definitionName of sortedNames) {
        if (occupiedNames.has(definitionName))
            continue;
        allocated.set(definitionName, definitionName);
        used.add(definitionName);
    }
    for (const definitionName of sortedNames) {
        if (allocated.has(definitionName))
            continue;
        let commandName = `workflow-${definitionName}`;
        while (reservedBareNames.has(commandName) || used.has(commandName) || occupiedNames.has(commandName)) {
            commandName = `workflow-${commandName}`;
        }
        allocated.set(definitionName, commandName);
        used.add(commandName);
    }
    return allocated;
}
//# sourceMappingURL=aliases.js.map