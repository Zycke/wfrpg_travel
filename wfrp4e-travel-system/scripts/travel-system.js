/**
 * WFRP4e Travel System Module
 * Main initialization file
 */

import { PartySheet } from './party-sheet.js';

Hooks.once('init', async function() {
    console.log('WFRP4e Travel System | Initializing Travel System Module');
    
    // Register Handlebars helpers
    Handlebars.registerHelper('lookup', function(obj, key, subkey) {
        if (!obj || !key) return undefined;
        const item = obj[key];
        if (!item || !subkey) return item;
        return item[subkey];
    });
    
    Handlebars.registerHelper('gte', function(a, b) {
        return a >= b;
    });
    
    // Register module settings
    game.settings.register('wfrp4e-travel-system', 'debugMode', {
        name: 'Debug Mode',
        hint: 'Enable console logging for debugging purposes',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false
    });
    
    // Register the custom party sheet
    Actors.registerSheet('wfrp4e', PartySheet, {
        types: ['character'],
        makeDefault: false,
        label: 'Travel Party Sheet'
    });
    
    console.log('WFRP4e Travel System | Party Sheet registered');
});

Hooks.once('ready', async function() {
    console.log('WFRP4e Travel System | Module Ready');
    
    // Inform users about the party sheet
    console.log('WFRP4e Travel System | To create a party: Create a Character actor and assign the "Travel Party Sheet"');
});

// Export for debugging purposes
window.TravelSystem = {
    PartySheet
};
