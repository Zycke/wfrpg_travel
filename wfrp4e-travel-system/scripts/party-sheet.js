/**
 * Custom Actor Sheet for Party Management
 * Extends the base ActorSheet to provide travel system functionality
 */

export class PartySheet extends ActorSheet {
    
    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['wfrp4e', 'sheet', 'actor', 'party-sheet'],
            template: 'modules/wfrp4e-travel-system/templates/party-sheet.html',
            width: 800,
            height: 720,
            tabs: [
                {
                    navSelector: '.sheet-tabs',
                    contentSelector: '.sheet-body',
                    initial: 'overview'
                }
            ],
            dragDrop: [{ dragSelector: null, dropSelector: null }],
            scrollY: ['.tab-content']
        });
    }
    
    /** @override */
    get template() {
        return 'modules/wfrp4e-travel-system/templates/party-sheet.html';
    }
    
    /** @override */
    async getData() {
        const context = super.getData();
        const actorData = this.actor.toObject(false);
        
        // Check if this actor has party flags, if not initialize them
        let partyFlags = this.actor.getFlag('wfrp4e-travel-system', 'isPartyActor');
        
        if (!partyFlags) {
            // Initialize party flags for the first time
            await this._initializePartyData();
            // Refresh the actor data after initialization
            partyFlags = this.actor.flags['wfrp4e-travel-system'];
        } else {
            partyFlags = this.actor.flags['wfrp4e-travel-system'];
        }
        
        // Add party-specific data to context
        context.isPartyActor = partyFlags.isPartyActor || false;
        context.journey = partyFlags.journey || {};
        context.resources = partyFlags.resources || {};
        context.travel = partyFlags.travel || {};
        context.weather = partyFlags.weather || {};
        
        // Get linked character data
        context.linkedCharacters = this._getLinkedCharacters(partyFlags.linkedCharacters || []);
        
        // Calculate weariness threshold if characters are linked
        if (context.linkedCharacters.length > 0) {
            context.resources.wearinessThreshold = this._calculateWearinessThreshold(context.linkedCharacters);
            // Add +2 to threshold if party has mounts
            if (context.travel.hasMounts) {
                context.resources.wearinessThreshold += 2;
            }
        }
        
        // Calculate Journey Pool maximum (base 10 - travel fatigue)
        const baseJPMax = 10;
        const travelFatigue = context.resources.travelFatigue || 0;
        context.resources.journeyPool.max = Math.max(0, baseJPMax - travelFatigue);
        
        // Add camp tasks data with proper initialization
        if (!partyFlags.camp) {
            await this.actor.setFlag('wfrp4e-travel-system', 'camp', { tasks: {} });
            partyFlags.camp = { tasks: {} };
        }
        context.camp = partyFlags.camp || { tasks: {} };
        
        // Ensure tasks object exists
        if (!context.camp.tasks) {
            context.camp.tasks = {};
        }
        
        // Pre-process task data for each character so template doesn't need helpers
        for (const char of context.linkedCharacters) {
            const task = context.camp.tasks[char.id] || { keepingWatch: false, selectedAction: null };
            char.taskData = {
                keepingWatch: task.keepingWatch || false,
                selectedAction: task.selectedAction || null
            };
            // Extract first name only for Tasks panel
            char.firstName = char.name.split(' ')[0];
        }
        
        // Calculate watch statistics
        context.watchCount = 0;
        context.hasRecuperate1 = false;
        context.hasRecuperate2Plus = false;
        let recuperateCount = 0;
        let watchingCharacters = [];
        
        for (const char of context.linkedCharacters) {
            const task = context.camp.tasks[char.id];
            if (task && task.keepingWatch) {
                context.watchCount++;
                watchingCharacters.push(char);
                if (task.selectedAction === 'recuperate') {
                    recuperateCount++;
                }
            }
        }
        
        // Add fatigue test text to each watching character
        for (const char of watchingCharacters) {
            const task = context.camp.tasks[char.id];
            if (task && task.selectedAction === 'recuperate') {
                char.fatigueTest = 'No Fatigue Gained';
            } else if (context.watchCount >= 3) {
                char.fatigueTest = 'Average Endurance Test';
            } else if (context.watchCount === 2) {
                char.fatigueTest = 'Challenging Endurance Test';
            } else if (context.watchCount === 1) {
                char.fatigueTest = '+1 Fatigue';
            }
        }
        
        context.watchingCharacters = watchingCharacters;
        context.hasRecuperate1 = (context.watchCount === 1 && recuperateCount === 1);
        context.hasRecuperate2Plus = (context.watchCount >= 2 && recuperateCount >= 2);
        context.showWatchSuccess = context.watchCount >= 3;
        context.showWatchWarning = context.watchCount === 2;
        context.showWatchDanger = context.watchCount === 1;
        context.showWatchNone = context.watchCount === 0;
        context.showInsufficientWatch = context.watchCount <= 1; // Show warning for 0 or 1 watcher
        
        // Process weather data for template
        if (!context.weather.conditions) {
            context.weather.conditions = { climate: 'temperate', season: 'summer', terrain: 'plains' };
        }
        if (!context.weather.current) {
            context.weather.current = { temperature: 'comfortable', precipitation: 'none', visibility: 'clear', wind: 'still' };
        }
        if (!context.weather.gear) {
            context.weather.gear = { weatherAppropriateGear: false, campSetup: false };
        }
        
        // Calculate weather modifiers
        const seasonMod = { spring: 2, summer: 0, autumn: 2, winter: 4 }[context.weather.conditions.season || 'summer'];
        const climateMod = { hot: -2, temperate: 0, cold: 2 }[context.weather.conditions.climate || 'temperate'];
        const terrainTempMod = (context.weather.conditions.terrain === 'mountains') ? 1 : 0;
        const terrainWindMod = (context.weather.conditions.terrain === 'mountains') ? 2 : 0;
        
        context.weather.modifiers = {
            temperature: `+${seasonMod + climateMod + terrainTempMod}`,
            precipitation: `+${seasonMod}`,
            wind: terrainWindMod > 0 ? `+${terrainWindMod}` : '+0'
        };
        
        // Check for extreme weather
        const extremeWeather = this._checkExtremeWeather();
        context.weather.isBlizzard = extremeWeather.type === 'blizzard';
        context.weather.isExtremeCold = extremeWeather.type === 'extreme-cold';
        
        // Calculate exposure
        const exposure = this._calculateExposure();
        context.weather.exposure = {
            traveling: exposure.travelingExposure,
            camping: exposure.campingExposure,
            explanation: exposure.explanation,
            daily: partyFlags.travel?.status === 'traveling' ? exposure.travelingExposure : exposure.campingExposure
        };
        
        // Add warnings for Overview tab
        context.weather.extremeTempProvisions = (context.weather.current.temperature === 'sweltering' || context.weather.current.temperature === 'bitter');
        context.weather.blizzardTraveling = (context.weather.isBlizzard && partyFlags.travel?.status === 'traveling');
        
        // Build list of active weather effects for Overview display
        const activeEffects = [];
        
        // Temperature effects
        if (context.weather.current.temperature === 'sweltering' || context.weather.current.temperature === 'bitter') {
            activeEffects.push('2x provisions usage');
            activeEffects.push('+2 weariness (when JP=0 or on events)');
        } else if (context.weather.current.temperature === 'hot' || context.weather.current.temperature === 'chilly') {
            activeEffects.push('+1 weariness (when JP=0 or on events)');
        }
        
        // Precipitation effects (only with cold temperatures)
        if ((context.weather.current.temperature === 'chilly' || context.weather.current.temperature === 'bitter') &&
            context.weather.current.precipitation !== 'none') {
            if (context.weather.current.precipitation === 'light') {
                activeEffects.push('+1 weariness from cold precipitation');
            } else if (context.weather.current.precipitation === 'heavy') {
                activeEffects.push('+2 weariness from cold precipitation');
            } else if (context.weather.current.precipitation === 'very-heavy') {
                activeEffects.push('+3 weariness from cold precipitation');
            }
        }
        
        // Visibility effects
        if (context.weather.current.visibility === 'moderate') {
            activeEffects.push('-1 SL (travel actions, hunting, scouting, navigation, perception)');
        } else if (context.weather.current.visibility === 'poor') {
            activeEffects.push('-2 SL (travel actions, hunting, scouting, navigation, perception)');
            activeEffects.push('-1 SL (ranged weapons)');
        }
        
        // Wind effects
        if (context.weather.current.wind === 'strong') {
            activeEffects.push('-1 SL to ranged attacks');
        } else if (context.weather.current.wind === 'very-strong') {
            activeEffects.push('-2 SL to ranged attacks');
        }
        
        // Blizzard effects
        if (context.weather.isBlizzard) {
            activeEffects.push('⚠ BLIZZARD: Movement -50%, Must spend 1 JP/day (or +1 weariness)');
        } else if (context.weather.isExtremeCold) {
            activeEffects.push('⚠ EXTREME COLD: Exposure gain');
        }
        
        context.weather.activeEffects = activeEffects.length > 0 ? activeEffects : null;
        
        // Add system and user info
        context.isGM = game.user.isGM;
        context.editable = this.isEditable;
        
        return context;
    }
    
    /** @override */
    async _render(force, options) {
        await super._render(force, options);
        
        // Update cost display after render
        setTimeout(() => {
            this._updateCostDisplay();
        }, 100);
    }
    
    /**
     * Initialize party flags on the actor for the first time
     */
    async _initializePartyData() {
        const initialData = {
            isPartyActor: true,
            linkedCharacters: [],
            journey: {
                currentPhase: 'planning',
                journeyLength: 0,
                dangerRating: 0,
                hexesUntilEvent: 0,
                daysOnRoad: 0,
                factors: {
                    stealthy: false,
                    fastLight: false,
                    undeveloped: false,
                    difficultTerrain: false,
                    minimalAuthority: false,
                    challengingClimate: false,
                    hostileCreatures: false,
                    localBanditry: false,
                    hazardousTerrain: false,
                    warRavaged: false,
                    abundantEnemies: false,
                    deadlyClimate: false
                }
            },
            resources: {
                preparednessPool: 0,
                journeyPool: { current: 0, max: 10 },
                provisions: 0,
                mountProvisions: 0,
                weariness: 0,
                wearinessThreshold: 0,
                travelFatigue: 0,
                hunger: 0,
                exposure: 0,
                consumables: {
                    spirits: 0,
                    campSupplies: 0,
                    preservatives: 0,
                    survivalTools: 0,
                    medicinalHerbs: 0,
                    specializedEquipment: 0,
                    updatedMaps: 0,
                    meticulousPlanning: false
                }
            },
            travel: {
                status: 'traveling',
                hasMounts: false,
                mountsGrazing: false,
                forcedMarch: false,
                extraRations: false,
                halfRations: false
            },
            weather: {
                conditions: {
                    climate: 'temperate',
                    season: 'summer',
                    terrain: 'plains'
                },
                current: {
                    temperature: 'comfortable',
                    precipitation: 'none',
                    visibility: 'clear',
                    wind: 'still'
                },
                gear: {
                    weatherAppropriateGear: false,
                    campSetup: false
                }
            },
            camp: {
                tasks: {}
            }
        };
        
        // Set all the flags at once
        await this.actor.update({
            'flags.wfrp4e-travel-system': initialData
        });
        
        ui.notifications.info(`${this.actor.name} initialized as a Party actor`);
    }
    
    /**
     * Get full actor data for linked characters
     */
    _getLinkedCharacters(characterIds) {
        const exposure = this.actor.getFlag('wfrp4e-travel-system', 'resources.exposure') || 0;
        
        return characterIds
            .map(id => game.actors.get(id))
            .filter(actor => actor !== null)
            .map(actor => {
                const tb = actor.system.characteristics.t.bonus || 0;
                const exposureDamage = Math.max(0, exposure - tb);
                const currentWounds = actor.system.status.wounds.value || 0;
                const maxWounds = actor.system.status.wounds.max || 0;
                
                return {
                    id: actor.id,
                    name: actor.name,
                    img: actor.img,
                    tb: tb,
                    currentWounds: currentWounds,
                    maxWounds: maxWounds,
                    exposureWarning: exposureDamage > 0,
                    exposureDamage: exposureDamage
                };
            });
    }
    
    /**
     * Calculate weariness threshold as average of party members' Toughness Bonuses
     */
    _calculateWearinessThreshold(characters) {
        if (characters.length === 0) return 0;
        const totalTB = characters.reduce((sum, char) => sum + char.tb, 0);
        return Math.floor(totalTB / characters.length);
    }
    
    /**
     * Add weariness and automatically handle overflow to Travel Fatigue
     * @param {number} amount - Amount of weariness to add
     * @returns {Object} - Object with wearinessGained and fatigueGained
     */
    async _addWeariness(amount) {
        const linkedCharacters = this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || [];
        const characterData = this._getLinkedCharacters(linkedCharacters);
        const currentWeariness = this.actor.getFlag('wfrp4e-travel-system', 'resources.weariness') || 0;
        const currentTravelFatigue = this.actor.getFlag('wfrp4e-travel-system', 'resources.travelFatigue') || 0;
        const hasMounts = this.actor.getFlag('wfrp4e-travel-system', 'travel.hasMounts') || false;
        
        // Calculate threshold
        const baseThreshold = this._calculateWearinessThreshold(characterData);
        const wearinessThreshold = baseThreshold + (hasMounts ? 2 : 0);
        
        if (wearinessThreshold <= 0) {
            // No threshold, just add weariness
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.weariness', currentWeariness + amount);
            return { wearinessGained: amount, fatigueGained: 0 };
        }
        
        // Calculate overflow (includes current weariness + new amount)
        // Weariness should stay at 0 to threshold, only converting when > threshold
        const totalWeariness = currentWeariness + amount;
        let fatigueGained = 0;
        let newWeariness = totalWeariness;
        
        if (totalWeariness > wearinessThreshold) {
            // Convert overflow: e.g., threshold=3, weariness=4 → 1 fatigue + 1 weariness
            fatigueGained = Math.floor((totalWeariness - 1) / wearinessThreshold);
            newWeariness = ((totalWeariness - 1) % wearinessThreshold) + 1;
        }
        
        const newTravelFatigue = currentTravelFatigue + fatigueGained;
        
        // Update values
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.weariness', newWeariness);
        
        if (fatigueGained > 0) {
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.travelFatigue', newTravelFatigue);
        }
        
        return { wearinessGained: amount, fatigueGained: fatigueGained, newWeariness: newWeariness };
    }
    
    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        
        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;
        
        // Remove character from party
        html.find('.remove-character').click(this._onRemoveCharacter.bind(this));
        
        // Resource increment/decrement buttons
        html.find('.resource-control').click(this._onResourceControl.bind(this));
        
        // Toggle switches for travel options
        html.find('.travel-option-toggle').change(this._onTravelOptionToggle.bind(this));
        
        // Phase change buttons
        html.find('.phase-control').click(this._onPhaseControl.bind(this));
        
        // Danger factor checkboxes
        html.find('.danger-factor').change(this._onDangerFactorChange.bind(this));
        
        // Phase cycling button
        html.find('[data-action="cycle-phase"]').on('click contextmenu', this._onPhaseCycle.bind(this));
        
        // Status toggle button
        html.find('[data-action="toggle-status"]').click(this._onStatusToggle.bind(this));
        
        // GM roll for hexes until event
        html.find('[data-action="roll-hexes"]').click(this._onRollHexesUntilEvent.bind(this));
        
        // Action buttons
        html.find('.action-button').click(this._onActionRoll.bind(this));
        
        // Reset consumables button
        html.find('.reset-consumables-btn').click(this._onResetConsumables.bind(this));
        
        // Watch toggle
        html.find('.watch-toggle').click(this._onWatchToggle.bind(this));
        
        // Task action select
        html.find('.task-action-select').change(this._onTaskActionChange.bind(this));
        
        // Weather generation button
        html.find('.generate-weather-btn').click(this._generateWeather.bind(this));
        
        // Weather condition dropdowns
        html.find('.weather-condition-select').change(this._onWeatherConditionChange.bind(this));
        
        // Weather manual override dropdowns
        html.find('.weather-override-select').change(this._onWeatherOverride.bind(this));
        
        // Weather gear checkboxes
        html.find('.weather-gear-checkbox').change(this._onWeatherGearChange.bind(this));
    }
    
    /**
     * Handle dropping an actor onto the party sheet
     */
    async _onDrop(event) {
        event.preventDefault();
        
        const data = TextEditor.getDragEventData(event);
        
        if (data.type !== 'Actor') return;
        
        const actor = await fromUuid(data.uuid);
        
        if (!actor) {
            ui.notifications.warn('Could not find actor');
            return;
        }
        
        // Only allow character actors
        if (actor.type !== 'character') {
            ui.notifications.warn('Only character actors can be added to the party');
            return;
        }
        
        // Check if already in party
        const linkedCharacters = this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || [];
        if (linkedCharacters.includes(actor.id)) {
            ui.notifications.info(`${actor.name} is already in the party`);
            return;
        }
        
        // Add to party
        linkedCharacters.push(actor.id);
        await this.actor.setFlag('wfrp4e-travel-system', 'linkedCharacters', linkedCharacters);
        
        // Update cost display since party size changed
        setTimeout(() => {
            this._updateCostDisplay();
        }, 100);
        
        ui.notifications.info(`${actor.name} added to the party`);
    }
    
    /**
     * Handle removing a character from the party
     */
    async _onRemoveCharacter(event) {
        event.preventDefault();
        const characterId = event.currentTarget.dataset.characterId;
        
        const linkedCharacters = this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || [];
        const filtered = linkedCharacters.filter(id => id !== characterId);
        
        await this.actor.setFlag('wfrp4e-travel-system', 'linkedCharacters', filtered);
        
        // Update cost display since party size changed
        setTimeout(() => {
            this._updateCostDisplay();
        }, 100);
        
        const actor = game.actors.get(characterId);
        ui.notifications.info(`${actor?.name || 'Character'} removed from the party`);
    }
    
    /**
     * Handle resource increment/decrement buttons
     */
    async _onResourceControl(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const action = button.dataset.action;
        const resourcePath = button.dataset.resource;
        
        // Special handling for Days on Road increase
        if (resourcePath === 'journey.daysOnRoad' && action === 'increase') {
            await this._onDaysOnRoadIncrease();
            return;
        }
        
        // Special handling for weariness - use overflow method
        if (resourcePath === 'resources.weariness') {
            const currentValue = this.actor.getFlag('wfrp4e-travel-system', resourcePath) || 0;
            
            if (action === 'increase') {
                const result = await this._addWeariness(1);
                if (result.fatigueGained > 0) {
                    ui.notifications.warn(`Weariness overflow! Gained +${result.fatigueGained} Travel Fatigue.`);
                }
            } else if (action === 'decrease') {
                await this.actor.setFlag('wfrp4e-travel-system', resourcePath, Math.max(0, currentValue - 1));
            }
            return;
        }
        
        // Special handling for meticulous planning (boolean)
        if (resourcePath === 'resources.consumables.meticulousPlanning') {
            const currentValue = this.actor.getFlag('wfrp4e-travel-system', resourcePath) || false;
            const newValue = !currentValue; // Toggle
            
            await this.actor.setFlag('wfrp4e-travel-system', resourcePath, newValue);
            
            // Adjust PP during preparation phase
            const currentPhase = this.actor.getFlag('wfrp4e-travel-system', 'journey.currentPhase');
            if (currentPhase === 'preparation') {
                const currentPrep = this.actor.getFlag('wfrp4e-travel-system', 'resources.preparednessPool') || 0;
                const ppCost = parseInt(button.dataset.ppCost) || 5;
                const newPrep = newValue ? currentPrep - ppCost : currentPrep + ppCost;
                await this.actor.setFlag('wfrp4e-travel-system', 'resources.preparednessPool', newPrep);
            }
            
            this._updateCostDisplay();
            return;
        }
        
        const currentValue = foundry.utils.getProperty(
            this.actor.flags['wfrp4e-travel-system'], 
            resourcePath
        ) || 0;
        
        let newValue = currentValue;
        
        if (action === 'increase') {
            newValue = currentValue + 1;
        } else if (action === 'decrease') {
            newValue = Math.max(0, currentValue - 1);
        }
        
        await this.actor.setFlag('wfrp4e-travel-system', resourcePath, newValue);
        
        // If we're in preparation phase and this has a PP cost, adjust preparedness pool
        const currentPhase = this.actor.getFlag('wfrp4e-travel-system', 'journey.currentPhase');
        const ppCost = parseInt(button.dataset.ppCost);
        
        if (currentPhase === 'preparation' && ppCost) {
            const currentPrep = this.actor.getFlag('wfrp4e-travel-system', 'resources.preparednessPool') || 0;
            let newPrep = currentPrep;
            
            if (action === 'increase') {
                newPrep = currentPrep - ppCost; // Subtract cost when adding
            } else if (action === 'decrease') {
                newPrep = currentPrep + ppCost; // Refund cost when removing
            }
            
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.preparednessPool', newPrep);
        }
        
        // Update cost display if this is a consumable button
        if (button.classList.contains('consumable-btn')) {
            this._updateCostDisplay();
        }
    }
    
    /**
     * Adjust preparedness pool when consumables are changed during preparation phase
     */
    async _adjustPreparednessForConsumable(resourcePath, action) {
        // Determine the cost of the consumable
        let cost = 1; // Default cost
        
        if (resourcePath.includes('specializedEquipment') || resourcePath.includes('updatedMaps')) {
            cost = 2;
        } else if (resourcePath.includes('meticulousPlanning')) {
            cost = 5;
        }
        
        // Get current preparedness pool
        const currentPrep = this.actor.getFlag('wfrp4e-travel-system', 'resources.preparednessPool') || 0;
        
        // Adjust based on action - allow negative values
        let newPrep = currentPrep;
        if (action === 'increase') {
            newPrep = currentPrep - cost; // Subtract cost when adding consumable
        } else if (action === 'decrease') {
            newPrep = currentPrep + cost; // Refund cost when removing consumable
        }
        
        // Update preparedness pool (allow negative)
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.preparednessPool', newPrep);
    }
    
    /**
     * Format currency with proper conversions
     * @param {number} brass - Brass pennies
     * @param {number} silver - Silver shillings
     * @returns {string} Formatted currency string
     */
    _formatCurrency(brass, silver) {
        // Ensure no negatives
        brass = Math.max(0, brass);
        silver = Math.max(0, silver);
        
        // Convert brass to silver (12 bp = 1 ss)
        const silverFromBrass = Math.floor(brass / 12);
        const remainingBrass = brass % 12;
        const totalSilver = silver + silverFromBrass;
        
        // Convert silver to gold (20 ss = 1 gc)
        const gold = Math.floor(totalSilver / 20);
        const remainingSilver = totalSilver % 20;
        
        // Build display string - ALWAYS show all three denominations
        return `${gold} gc ${remainingSilver} ss ${remainingBrass} bp`;
    }
    
    /**
     * Update the cost display on the Resources tab
     */
    _updateCostDisplay() {
        const consumables = this.actor.getFlag('wfrp4e-travel-system', 'resources.consumables') || {};
        const provisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.provisions') || 0;
        const mountProvisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.mountProvisions') || 0;
        const linkedCharacters = this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || [];
        const partySize = linkedCharacters.length;
        
        // Calculate costs
        // Provisions cost 1 silver per party member per day
        const provisionsCost = provisions * partySize; // in silver shillings
        const mountProvisionsCost = mountProvisions * 6; // in brass pennies
        
        const consumablesCost = 
            (consumables.campSupplies || 0) * 1 +
            (consumables.spirits || 0) * 1 +
            (consumables.preservatives || 0) * 5 +
            (consumables.survivalTools || 0) * 4 +
            (consumables.medicinalHerbs || 0) * 3; // in silver shillings
        
        const specialItemsCost = (consumables.specializedEquipment || 0) * 10; // in silver shillings
        
        const totalSilver = provisionsCost + consumablesCost + specialItemsCost;
        const totalBrass = mountProvisionsCost;
        
        // Update display
        const sheet = this.element[0];
        if (sheet) {
            const provisionsElem = sheet.querySelector('[data-cost-type="provisions"]');
            const mountProvisionsElem = sheet.querySelector('[data-cost-type="mountProvisions"]');
            const consumablesElem = sheet.querySelector('[data-cost-type="consumables"]');
            const specialItemsElem = sheet.querySelector('[data-cost-type="specialItems"]');
            const totalElem = sheet.querySelector('[data-cost-type="total"]');
            
            if (provisionsElem) provisionsElem.textContent = this._formatCurrency(0, provisionsCost);
            if (mountProvisionsElem) mountProvisionsElem.textContent = this._formatCurrency(mountProvisionsCost, 0);
            if (consumablesElem) consumablesElem.textContent = this._formatCurrency(0, consumablesCost);
            if (specialItemsElem) specialItemsElem.textContent = this._formatCurrency(0, specialItemsCost);
            if (totalElem) totalElem.textContent = this._formatCurrency(totalBrass, totalSilver);
        }
    }
    
    /**
     * Handle travel option toggles
     */
    async _onTravelOptionToggle(event) {
        const checkbox = event.currentTarget;
        const option = checkbox.dataset.option;
        const isChecked = checkbox.checked;
        
        await this.actor.setFlag('wfrp4e-travel-system', `travel.${option}`, isChecked);
    }
    
    /**
     * Handle phase control buttons
     */
    async _onPhaseControl(event) {
        event.preventDefault();
        const phase = event.currentTarget.dataset.phase;
        
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.currentPhase', phase);
        ui.notifications.info(`Journey phase changed to: ${phase}`);
    }
    
    /**
     * Handle danger factor checkbox changes
     */
    async _onDangerFactorChange(event) {
        const checkbox = event.currentTarget;
        const factor = checkbox.dataset.factor;
        const isChecked = checkbox.checked;
        
        await this.actor.setFlag('wfrp4e-travel-system', `journey.factors.${factor}`, isChecked);
        
        // Recalculate danger rating
        await this._calculateDangerRating();
    }
    
    /**
     * Calculate danger rating based on selected factors
     */
    async _calculateDangerRating() {
        const factors = this.actor.getFlag('wfrp4e-travel-system', 'journey.factors') || {};
        
        let dangerRating = 0;
        
        // -1 modifiers
        if (factors.stealthy) dangerRating -= 1;
        if (factors.fastLight) dangerRating -= 1;
        
        // +1 modifiers
        if (factors.undeveloped) dangerRating += 1;
        if (factors.difficultTerrain) dangerRating += 1;
        if (factors.minimalAuthority) dangerRating += 1;
        if (factors.challengingClimate) dangerRating += 1;
        if (factors.hostileCreatures) dangerRating += 1;
        if (factors.localBanditry) dangerRating += 1;
        
        // +2 modifiers
        if (factors.hazardousTerrain) dangerRating += 2;
        if (factors.warRavaged) dangerRating += 2;
        if (factors.abundantEnemies) dangerRating += 2;
        if (factors.deadlyClimate) dangerRating += 2;
        
        // Danger rating can't be negative
        dangerRating = Math.max(0, dangerRating);
        
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.dangerRating', dangerRating);
    }
    
    /**
     * Handle phase cycling (left-click advances, right-click retreats)
     */
    async _onPhaseCycle(event) {
        event.preventDefault();
        
        const phases = ['planning', 'preparation', 'travel', 'arrival'];
        const currentPhase = this.actor.getFlag('wfrp4e-travel-system', 'journey.currentPhase') || 'planning';
        const currentIndex = phases.indexOf(currentPhase);
        
        let newIndex;
        if (event.type === 'contextmenu') {
            // Right-click: go back
            newIndex = currentIndex - 1;
            if (newIndex < 0) newIndex = phases.length - 1; // Wrap to end
        } else {
            // Left-click: go forward
            newIndex = currentIndex + 1;
            if (newIndex >= phases.length) newIndex = 0; // Wrap to beginning
        }
        
        const newPhase = phases[newIndex];
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.currentPhase', newPhase);
        ui.notifications.info(`Journey phase changed to: ${newPhase}`);
    }
    
    /**
     * Handle status toggle between traveling and camping
     */
    async _onStatusToggle(event) {
        event.preventDefault();
        
        const currentStatus = this.actor.getFlag('wfrp4e-travel-system', 'travel.status') || 'traveling';
        const newStatus = currentStatus === 'traveling' ? 'camping' : 'traveling';
        
        await this.actor.setFlag('wfrp4e-travel-system', 'travel.status', newStatus);
        ui.notifications.info(`Status changed to: ${newStatus}`);
    }
    
    /**
     * Handle GM roll for hexes until event
     * Formula: 1d10, halve (round up), +1, then apply DR modifier
     * DR 2-4: -1, DR 5+: -2
     */
    async _onRollHexesUntilEvent(event) {
        event.preventDefault();
        
        const dangerRating = this.actor.getFlag('wfrp4e-travel-system', 'journey.dangerRating') || 0;
        
        // Roll 1d10
        const roll = await new Roll('1d10').evaluate({async: true});
        
        // Halve and round up, then add 1
        const halved = Math.ceil(roll.total / 2);
        const baseResult = halved + 1;
        
        // Calculate danger rating modifier
        let drModifier = 0;
        if (dangerRating >= 5) {
            drModifier = -2;
        } else if (dangerRating >= 2) {
            drModifier = -1;
        }
        
        // Apply modifier (minimum 1)
        const result = Math.max(1, baseResult + drModifier);
        
        // Show the roll to GM only
        await roll.toMessage({
            speaker: {alias: `${this.actor.name} - Hexes Until Event`},
            flavor: `<strong>Hexes Until Event Roll</strong><br>
                     Base Roll: ${roll.total}<br>
                     Halved (rounded up): ${halved}<br>
                     +1: ${baseResult}<br>
                     Danger Rating: ${dangerRating} (${drModifier >= 0 ? '+' : ''}${drModifier})<br>
                     <strong>Final Result: ${result} hexes</strong>`,
            whisper: [game.user.id]
        });
        
        // Update the hexes until event
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.hexesUntilEvent', result);
        
        ui.notifications.info(`Hexes until event set to ${result} (GM only)`);
    }
    
    /**
     * Handle action roll buttons
     */
    async _onActionRoll(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const action = button.dataset.action;
        const selector = button.closest('.character-selector');
        const select = selector.querySelector('.action-character-select');
        const characterId = select.value;
        
        if (!characterId) {
            ui.notifications.warn("Please select a character first");
            return;
        }
        
        const actor = game.actors.get(characterId);
        if (!actor) {
            ui.notifications.error("Character not found");
            return;
        }
        
        // Action configuration
        const actionConfig = {
            'pathfinding': {
                skill: 'Navigation',
                difficulty: 'average',
                isTravelAction: true
            },
            'forage': {
                skill: 'Outdoor Survival',
                difficulty: 'average',
                isTravelAction: true
            },
            'scout': {
                skill: 'Perception',
                difficulty: 'average',
                isTravelAction: true
            },
            'contingency': {
                skill: 'Leadership',
                difficulty: 'average',
                isTravelAction: true
            },
            'setup-camp': {
                skill: 'Outdoor Survival',
                difficulty: 'average',
                isTravelAction: false
            },
            'cook': {
                skill: 'Trade (Cook)',
                difficulty: 'easy',
                fallbackSkill: 'Outdoor Survival',
                fallbackDifficulty: 'average',
                isTravelAction: false
            },
            'hunt': {
                skill: 'Outdoor Survival',
                difficulty: 'average',
                isTravelAction: false
            },
            'raise-spirits': {
                skill: 'Entertain',
                difficulty: 'average',
                isTravelAction: false
            },
            'recuperate': {
                skill: 'Endurance',
                difficulty: 'challenging',
                isTravelAction: false
            },
            'revise-planning': {
                skill: 'Leadership',
                difficulty: 'average',
                isTravelAction: false
            },
            'trapping': {
                skill: 'Set Trap',
                difficulty: 'average',
                isTravelAction: false
            },
            'self-improvement': {
                skill: 'Pray',
                difficulty: 'average',
                fallbackSkill: 'Lore',
                fallbackDifficulty: 'average',
                isTravelAction: false
            },
            'scout-area': {
                skill: 'Perception',
                difficulty: 'average',
                isTravelAction: false
            }
        };
        
        const config = actionConfig[action];
        if (!config) {
            ui.notifications.error("Unknown action");
            return;
        }
        
        // Check/deduct cost for travel actions
        if (config.isTravelAction) {
            const canPayJP = await this._checkTravelActionCost();
            if (!canPayJP) {
                return; // User cancelled
            }
        }
        
        // Setup the skill test
        const setupData = await actor.setupSkill(config.skill, {
            title: `${action.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${actor.name}`,
            absolute: {
                difficulty: config.difficulty
            }
        });
        
        if (!setupData) {
            // If skill not found and there's a fallback, try fallback
            if (config.fallbackSkill) {
                const fallbackSetup = await actor.setupSkill(config.fallbackSkill, {
                    title: `${action.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${actor.name}`,
                    absolute: {
                        difficulty: config.fallbackDifficulty
                    }
                });
                
                if (fallbackSetup) {
                    await this._handleSkillTest(fallbackSetup, actor, action);
                }
            }
            return;
        }
        
        await this._handleSkillTest(setupData, actor, action);
    }
    
    /**
     * Check if party can pay travel action cost (1 JP or +1 weariness)
     */
    async _checkTravelActionCost() {
        const currentJP = this.actor.getFlag('wfrp4e-travel-system', 'resources.journeyPool.current') || 0;
        
        let choice;
        if (currentJP > 0) {
            choice = await Dialog.confirm({
                title: "Travel Action Cost",
                content: `<p>This travel action costs:</p>
                         <ul>
                         <li><strong>1 Journey Point</strong> (currently have ${currentJP})</li>
                         <li><strong>OR +1 Weariness</strong></li>
                         </ul>
                         <p>Pay with Journey Point?</p>`,
                yes: () => "jp",
                no: () => "weariness",
                defaultYes: true
            });
        } else {
            choice = await Dialog.confirm({
                title: "Travel Action Cost",
                content: `<p>Journey Pool is empty. This action will <strong>increase weariness by 1</strong>.</p>
                         <p>Continue?</p>`,
                defaultYes: true
            });
            
            if (!choice) return false;
            choice = "weariness";
        }
        
        if (!choice) return false;
        
        if (choice === "jp") {
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.journeyPool.current', currentJP - 1);
        } else {
            const result = await this._addWeariness(1);
            if (result.fatigueGained > 0) {
                ui.notifications.warn(`Weariness overflow! Gained +${result.fatigueGained} Travel Fatigue.`);
            }
        }
        
        return true;
    }
    
    /**
     * Handle the skill test and process results
     */
    async _handleSkillTest(setupData, actor, action) {
        const test = await actor.basicTest(setupData);
        
        if (!test) return;
        
        const result = test.result;
        const sl = result.SL;
        const isCritical = result.critical;
        const isFumble = result.fumble;
        
        // Process results based on action
        await this._processActionResult(action, sl, isCritical, isFumble, actor);
    }
    
    /**
     * Process action results and update party resources
     */
    async _processActionResult(action, sl, isCritical, isFumble, actor) {
        const success = sl >= 0;
        
        switch (action) {
            case 'pathfinding':
                if (isFumble) {
                    await this._adjustWeariness(2);
                    ui.notifications.error("Lost! No progress made, +2 weariness");
                } else if (!success) {
                    await this._adjustWeariness(1);
                    ui.notifications.warn("Poor pathfinding, +1 weariness");
                } else if (isCritical) {
                    await this._adjustWeariness(-1);
                    ui.notifications.info("Excellent navigation! -1 weariness and can take camp actions today");
                } else {
                    await this._adjustWeariness(-1);
                    ui.notifications.info("Good pathfinding, -1 weariness");
                }
                break;
                
            case 'forage':
                if (isFumble) {
                    // Roll 1d10 damage - need to create a roll
                    const damageRoll = await new Roll('1d10').evaluate({async: true});
                    await damageRoll.toMessage({
                        flavor: `${actor.name} poisoned while foraging!`,
                        speaker: {alias: actor.name}
                    });
                    ui.notifications.error(`Poisoned! Take ${damageRoll.total} damage`);
                } else if (success) {
                    let provisions = 1;
                    if (isCritical) provisions++;
                    provisions += Math.floor(sl / 3);
                    await this._adjustProvisions(provisions);
                    ui.notifications.info(`Foraged ${provisions} provisions`);
                }
                break;
                
            case 'scout':
                if (success) {
                    const hexes = this.actor.getFlag('wfrp4e-travel-system', 'journey.hexesUntilEvent') || 0;
                    if (isCritical) {
                        ui.notifications.info(`Hexes until event: ${hexes}. GM should reveal event and offer 1 JP re-roll`);
                    } else {
                        ui.notifications.info(`Hexes until event: ${hexes}. GM should reveal next hex`);
                    }
                }
                break;
                
            case 'contingency':
                if (success) {
                    const bonus = isCritical ? 2 : 1;
                    ui.notifications.info(`+${bonus} to next event roll (GM tracking)`);
                }
                break;
                
            case 'setup-camp':
                if (success) {
                    ui.notifications.info("Camp setup successfully! -1 weariness/day, healing checks Challenging (+0)");
                } else {
                    ui.notifications.warn("Poor camp setup. Healing checks are Hard (-10)");
                }
                break;
                
            case 'cook':
                if (isFumble) {
                    await this._adjustTravelFatigue(1);
                    ui.notifications.error("Critical cooking failure! +1 travel fatigue");
                } else if (success) {
                    if (sl >= 6 || isCritical) {
                        const choice = await Dialog.confirm({
                            title: "Excellent Cooking!",
                            content: "<p>Choose one:</p><ul><li>Set weariness to 0</li><li>Spend 1 provision to remove 1 travel fatigue</li></ul>",
                            yes: () => "weariness",
                            no: () => "fatigue"
                        });
                        
                        if (choice) {
                            await this.actor.setFlag('wfrp4e-travel-system', 'resources.weariness', 0);
                            ui.notifications.info("Weariness set to 0!");
                        } else {
                            await this._adjustProvisions(-1);
                            await this._adjustTravelFatigue(-1);
                            ui.notifications.info("Spent 1 provision, -1 travel fatigue");
                        }
                    } else if (sl >= 2) {
                        await this._adjustWeariness(-1);
                        ui.notifications.info("Good meal! -1 weariness");
                    }
                }
                break;
                
            case 'hunt':
                if (isFumble) {
                    const damageRoll = await new Roll('1d10').evaluate({async: true});
                    await damageRoll.toMessage({
                        flavor: `${actor.name} injured while hunting!`,
                        speaker: {alias: actor.name}
                    });
                    ui.notifications.error(`Injured! Take ${damageRoll.total} damage`);
                } else if (success) {
                    let provisions = 1;
                    if (isCritical) provisions += 2;
                    provisions += Math.floor(sl / 2);
                    await this._adjustProvisions(provisions);
                    ui.notifications.info(`Hunted ${provisions} provisions`);
                }
                break;
                
            case 'raise-spirits':
                if (success) {
                    const fb = actor.system.characteristics.fel.bonus || 0;
                    const reduction = isCritical ? fb : 1;
                    await this._adjustWeariness(-reduction);
                    ui.notifications.info(`Spirits raised! -${reduction} weariness`);
                }
                break;
                
            case 'recuperate':
                if (success) {
                    const tb = actor.system.characteristics.t.bonus || 0;
                    const healing = sl + tb;
                    ui.notifications.info(`Rest successful! Heal ${healing} wounds`);
                }
                break;
                
            case 'revise-planning':
                const currentJP = this.actor.getFlag('wfrp4e-travel-system', 'resources.journeyPool.current') || 0;
                const maxJP = this.actor.getFlag('wfrp4e-travel-system', 'resources.journeyPool.max') || 10;
                
                if (isFumble) {
                    await this.actor.setFlag('wfrp4e-travel-system', 'resources.journeyPool.max', Math.max(1, maxJP - 2));
                    ui.notifications.error("Planning disaster! -2 max JP");
                } else if (!success) {
                    await this.actor.setFlag('wfrp4e-travel-system', 'resources.journeyPool.max', Math.max(1, maxJP - 1));
                    ui.notifications.warn("Poor planning. -1 max JP");
                } else {
                    const jpGained = sl;
                    const newJP = Math.min(maxJP, currentJP + jpGained);
                    await this.actor.setFlag('wfrp4e-travel-system', 'resources.journeyPool.current', newJP);
                    
                    if (newJP < maxJP) {
                        await this.actor.setFlag('wfrp4e-travel-system', 'resources.journeyPool.max', Math.max(1, maxJP - 1));
                        ui.notifications.info(`+${jpGained} JP but pool not full, -1 max JP`);
                    } else {
                        if (isCritical) {
                            await this.actor.setFlag('wfrp4e-travel-system', 'resources.journeyPool.current', newJP + 1);
                            await this.actor.setFlag('wfrp4e-travel-system', 'resources.journeyPool.max', maxJP + 1);
                            ui.notifications.info(`Critical! +${jpGained + 1} JP and +1 max JP!`);
                        } else {
                            ui.notifications.info(`+${jpGained} JP`);
                        }
                    }
                }
                break;
                
            case 'trapping':
                if (success) {
                    let provisions = 1;
                    if (isCritical) provisions += 2;
                    provisions += Math.floor(sl / 2);
                    await this._adjustProvisions(provisions);
                    ui.notifications.info(`Traps caught ${provisions} provisions. Becomes free action on subsequent days`);
                }
                break;
                
            case 'self-improvement':
                if (success) {
                    ui.notifications.info("+10 to next check with chosen skill or related skill");
                }
                break;
                
            case 'scout-area':
                if (success) {
                    const hexes = this.actor.getFlag('wfrp4e-travel-system', 'journey.hexesUntilEvent') || 0;
                    if (isCritical) {
                        ui.notifications.info(`Days/JP until event: ${hexes}. GM should reveal event. May spend 2 JP to choose "No Event"`);
                    } else {
                        ui.notifications.info(`Days/JP until event: ${hexes}. Vision expanded one hex in all directions`);
                    }
                }
                break;
        }
    }
    
    // Helper methods for resource adjustments
    async _adjustWeariness(amount) {
        if (amount > 0) {
            // Use the overflow-handling method for increases
            const result = await this._addWeariness(amount);
            if (result.fatigueGained > 0) {
                ui.notifications.warn(`Weariness overflow! Gained +${result.fatigueGained} Travel Fatigue.`);
            }
        } else if (amount < 0) {
            // For decreases, just reduce weariness (can't go below 0)
            const current = this.actor.getFlag('wfrp4e-travel-system', 'resources.weariness') || 0;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.weariness', Math.max(0, current + amount));
        }
    }
    
    async _adjustTravelFatigue(amount) {
        const current = this.actor.getFlag('wfrp4e-travel-system', 'resources.travelFatigue') || 0;
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.travelFatigue', Math.max(0, current + amount));
    }
    
    async _adjustProvisions(amount) {
        const current = this.actor.getFlag('wfrp4e-travel-system', 'resources.provisions') || 0;
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.provisions', Math.max(0, current + amount));
        this._updateCostDisplay();
    }
    
    /**
     * Handle watch toggle
     */
    async _onWatchToggle(event) {
        event.preventDefault();
        const characterId = event.currentTarget.dataset.characterId;
        
        let tasks = this.actor.getFlag('wfrp4e-travel-system', 'camp.tasks') || {};
        
        // Initialize task for this character if it doesn't exist
        if (!tasks[characterId]) {
            tasks[characterId] = { keepingWatch: false, selectedAction: null };
        }
        
        // Toggle watch status
        tasks[characterId].keepingWatch = !tasks[characterId].keepingWatch;
        
        await this.actor.setFlag('wfrp4e-travel-system', 'camp.tasks', tasks);
        this.render(false);
    }
    
    /**
     * Handle task action selection change
     */
    async _onTaskActionChange(event) {
        event.preventDefault();
        const characterId = event.currentTarget.dataset.characterId;
        const selectedAction = event.currentTarget.value;
        
        let tasks = this.actor.getFlag('wfrp4e-travel-system', 'camp.tasks') || {};
        
        // Initialize task for this character if it doesn't exist
        if (!tasks[characterId]) {
            tasks[characterId] = { keepingWatch: false, selectedAction: null };
        }
        
        // Update selected action
        tasks[characterId].selectedAction = selectedAction || null;
        
        await this.actor.setFlag('wfrp4e-travel-system', 'camp.tasks', tasks);
    }
    
    /**
     * Reset all consumables to 0
     */
    async _onResetConsumables(event) {
        event.preventDefault();
        
        const confirm = await Dialog.confirm({
            title: "Reset All Consumables",
            content: "<p>This will reset all provisions, mount provisions, consumables, and special items to 0 and refund their Preparedness Pool cost.</p><p>Are you sure?</p>",
            defaultYes: false
        });
        
        if (!confirm) return;
        
        // Get current values before resetting
        const consumables = this.actor.getFlag('wfrp4e-travel-system', 'resources.consumables') || {};
        const provisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.provisions') || 0;
        const mountProvisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.mountProvisions') || 0;
        
        // Calculate PP refund based on actual PP costs (only count positive values)
        let ppRefund = 0;
        
        // Provisions and Mount Provisions: 1 PP each
        ppRefund += Math.max(0, provisions) * 1;
        ppRefund += Math.max(0, mountProvisions) * 1;
        
        // Basic consumables: 1 PP each
        ppRefund += Math.max(0, consumables.campSupplies || 0) * 1;
        ppRefund += Math.max(0, consumables.spirits || 0) * 1;
        ppRefund += Math.max(0, consumables.preservatives || 0) * 1;
        ppRefund += Math.max(0, consumables.survivalTools || 0) * 1;
        ppRefund += Math.max(0, consumables.medicinalHerbs || 0) * 1;
        
        // Special items
        ppRefund += Math.max(0, consumables.specializedEquipment || 0) * 2;
        ppRefund += Math.max(0, consumables.updatedMaps || 0) * 2;
        ppRefund += (consumables.meticulousPlanning ? 5 : 0);
        
        // Reset provisions
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.provisions', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.mountProvisions', 0);
        
        // Reset all consumables individually
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.campSupplies', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.spirits', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.preservatives', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.survivalTools', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.medicinalHerbs', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.specializedEquipment', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.updatedMaps', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.meticulousPlanning', false);
        
        // Refund PP
        if (ppRefund > 0) {
            const currentPP = this.actor.getFlag('wfrp4e-travel-system', 'resources.preparednessPool') || 0;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.preparednessPool', currentPP + ppRefund);
        }
        
        // Force full sheet re-render to update all displays
        await this.render(true);
        
        if (ppRefund > 0) {
            ui.notifications.info(`All consumables reset to 0. Refunded ${ppRefund} Preparedness Pool.`);
        } else {
            ui.notifications.info("All consumables reset to 0");
        }
    }
    
    /**
     * Weather Generation Methods
     */
    
    /**
     * Generate weather based on climate and season
     */
    async _generateWeather(event) {
        event.preventDefault();
        
        const climate = this.actor.getFlag('wfrp4e-travel-system', 'weather.conditions.climate') || 'temperate';
        const season = this.actor.getFlag('wfrp4e-travel-system', 'weather.conditions.season') || 'summer';
        const terrain = this.actor.getFlag('wfrp4e-travel-system', 'weather.conditions.terrain') || 'plains';
        
        // Get modifiers
        const seasonMod = { spring: 2, summer: 0, autumn: 2, winter: 4 }[season];
        const climateMod = { hot: -2, temperate: 0, cold: 2 }[climate];
        const terrainTempMod = terrain === 'mountains' ? 1 : 0;
        const terrainWindMod = terrain === 'mountains' ? 2 : 0;
        
        // Roll 1: Temperature (with season, climate, and terrain modifiers)
        const tempRoll = Math.floor(Math.random() * 10) + 1;
        const tempResult = tempRoll + seasonMod + climateMod + terrainTempMod;
        const temperature = this._lookupTemperature(tempResult);
        
        // Roll 2: Precipitation (season modifier only)
        const precipRoll = Math.floor(Math.random() * 10) + 1;
        const precipResult = precipRoll + seasonMod;
        const precipitation = this._lookupPrecipitation(precipResult);
        
        // Roll 3: Visibility (no modifiers initially)
        const visRoll = Math.floor(Math.random() * 10) + 1;
        let visibility = this._lookupVisibility(visRoll);
        let visibilityOverridden = false;
        
        // Roll 4: Wind (with terrain modifier)
        const windRoll = Math.floor(Math.random() * 10) + 1;
        const windResult = windRoll + terrainWindMod;
        const wind = this._lookupWind(windResult);
        
        // Apply precipitation override to visibility
        if (precipitation === 'heavy') {
            visibility = 'moderate';
            visibilityOverridden = true;
        } else if (precipitation === 'very-heavy') {
            visibility = 'poor';
            visibilityOverridden = true;
        }
        
        // Check for extreme weather conditions
        const isBlizzard = (temperature === 'bitter' && precipitation === 'very-heavy');
        const coldTemp = (temperature === 'chilly' || temperature === 'bitter');
        const heavyPrecip = (precipitation === 'heavy' || precipitation === 'very-heavy');
        const strongWind = (wind === 'strong' || wind === 'very-strong');
        const isExtremeCold = (coldTemp && heavyPrecip && strongWind);
        
        // Apply blizzard override to visibility (overrides everything)
        if (isBlizzard) {
            visibility = 'poor';
            visibilityOverridden = true;
        }
        
        // Save weather
        await this.actor.setFlag('wfrp4e-travel-system', 'weather.current', {
            temperature,
            precipitation,
            visibility,
            wind
        });
        
        // Build notification message
        let message = `<strong>Weather Generated:</strong><br>`;
        message += `Temperature: 1d10(${tempRoll}) + ${seasonMod + climateMod + terrainTempMod} = ${tempResult} → ${this._capitalizeWeather(temperature)}<br>`;
        message += `Precipitation: 1d10(${precipRoll}) + ${seasonMod} = ${precipResult} → ${this._capitalizeWeather(precipitation)}<br>`;
        message += `Visibility: 1d10(${visRoll}) = ${visRoll} → ${this._capitalizeWeather(visibility)}`;
        if (visibilityOverridden) {
            message += ` <em>(overridden)</em>`;
        }
        message += `<br>Wind: 1d10(${windRoll}) + ${terrainWindMod} = ${windResult} → ${this._capitalizeWeather(wind)}<br>`;
        
        // Add extreme weather warnings
        if (isBlizzard) {
            message += `<br><strong style="color: #d32f2f;">⚠ BLIZZARD CONDITIONS!</strong>`;
        } else if (isExtremeCold) {
            message += `<br><strong style="color: #ff9800;">⚠ EXTREME COLD CONDITIONS!</strong>`;
        }
        
        ui.notifications.info(message);
        
        // Re-render to update display
        this.render(false);
    }
    
    /**
     * Weather table lookup functions
     */
    _lookupTemperature(result) {
        const table = {
            1: 'sweltering',
            2: 'hot',
            3: 'hot',
            4: 'comfortable',
            5: 'comfortable',
            6: 'comfortable',
            7: 'comfortable',
            8: 'comfortable',
            9: 'chilly',
            10: 'chilly',
            11: 'bitter',
            12: 'bitter'
        };
        return result >= 13 ? 'bitter' : (table[result] || 'comfortable');
    }
    
    _lookupPrecipitation(result) {
        const table = {
            1: 'none',
            2: 'none',
            3: 'none',
            4: 'none',
            5: 'light',
            6: 'light',
            7: 'light',
            8: 'heavy',
            9: 'heavy',
            10: 'very-heavy',
            11: 'very-heavy',
            12: 'heavy'
        };
        return result >= 13 ? 'none' : (table[result] || 'none');
    }
    
    _lookupVisibility(result) {
        const table = {
            1: 'clear',
            2: 'clear',
            3: 'clear',
            4: 'clear',
            5: 'clear',
            6: 'moderate',
            7: 'moderate',
            8: 'moderate',
            9: 'poor',
            10: 'poor',
            11: 'moderate',
            12: 'moderate'
        };
        return result >= 13 ? 'clear' : (table[result] || 'clear');
    }
    
    _lookupWind(result) {
        const table = {
            1: 'still',
            2: 'gentle',
            3: 'moderate',
            4: 'moderate',
            5: 'moderate',
            6: 'strong',
            7: 'strong',
            8: 'strong',
            9: 'very-strong',
            10: 'very-strong',
            11: 'moderate',
            12: 'gentle'
        };
        return result >= 13 ? 'still' : (table[result] || 'moderate');
    }
    
    /**
     * Check for extreme weather conditions
     */
    _checkExtremeWeather() {
        const weather = this.actor.getFlag('wfrp4e-travel-system', 'weather.current') || {};
        
        const isBlizzard = (
            weather.temperature === 'bitter' && 
            weather.precipitation === 'very-heavy'
        );
        
        const isExtremeCold = (
            (weather.temperature === 'chilly' || weather.temperature === 'bitter') &&
            (weather.precipitation === 'heavy' || weather.precipitation === 'very-heavy') &&
            (weather.wind === 'strong' || weather.wind === 'very-strong')
        );
        
        // Blizzard takes precedence
        if (isBlizzard) {
            return { type: 'blizzard', isExtreme: true };
        } else if (isExtremeCold) {
            return { type: 'extreme-cold', isExtreme: true };
        }
        
        return { type: 'normal', isExtreme: false };
    }
    
    /**
     * Calculate exposure gain per day based on weather and gear
     */
    _calculateExposure() {
        const weather = this.actor.getFlag('wfrp4e-travel-system', 'weather.current') || {};
        const gear = this.actor.getFlag('wfrp4e-travel-system', 'weather.gear') || {};
        
        const extremeWeather = this._checkExtremeWeather();
        
        let travelingExposure = 0;
        let campingExposure = 0;
        let explanation = '';
        
        if (extremeWeather.type === 'blizzard') {
            travelingExposure = gear.weatherAppropriateGear ? 1 : 3;
            campingExposure = gear.campSetup ? 0 : travelingExposure;
            explanation = `Blizzard conditions: ${gear.weatherAppropriateGear ? '1' : '3'} exposure/day when traveling${gear.weatherAppropriateGear ? ' (with gear)' : ' (without gear)'}. ${gear.campSetup ? 'No exposure gain/loss' : 'Same as traveling'} when camping${gear.campSetup ? ' (camp setup)' : ' (no camp setup)'}.`;
        } else if (extremeWeather.type === 'extreme-cold') {
            travelingExposure = gear.weatherAppropriateGear ? 1 : 3;
            campingExposure = gear.campSetup ? 0 : travelingExposure;
            explanation = `Extreme cold conditions: ${gear.weatherAppropriateGear ? '1' : '3'} exposure/day when traveling${gear.weatherAppropriateGear ? ' (with gear)' : ' (without gear)'}. ${gear.campSetup ? 'No exposure gain/loss' : 'Same as traveling'} when camping${gear.campSetup ? ' (camp setup)' : ' (no camp setup)'}.`;
        } else {
            explanation = 'Normal weather conditions: No exposure gain.';
        }
        
        return { travelingExposure, campingExposure, explanation };
    }
    
    /**
     * Capitalize weather condition for display
     */
    _capitalizeWeather(str) {
        return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    
    /**
     * Handle weather condition dropdown changes (climate/season)
     */
    async _onWeatherConditionChange(event) {
        const select = event.currentTarget;
        const condition = select.dataset.condition; // 'climate' or 'season'
        const value = select.value;
        
        await this.actor.setFlag('wfrp4e-travel-system', `weather.conditions.${condition}`, value);
    }
    
    /**
     * Handle manual weather override
     */
    async _onWeatherOverride(event) {
        const select = event.currentTarget;
        const weatherType = select.dataset.weatherType; // 'temperature', 'precipitation', etc.
        const value = select.value;
        
        await this.actor.setFlag('wfrp4e-travel-system', `weather.current.${weatherType}`, value);
        this.render(false);
    }
    
    /**
     * Handle weather gear checkbox changes
     */
    async _onWeatherGearChange(event) {
        const checkbox = event.currentTarget;
        const gearType = checkbox.dataset.gear; // 'weatherAppropriateGear' or 'campSetup'
        const isChecked = checkbox.checked;
        
        await this.actor.setFlag('wfrp4e-travel-system', `weather.gear.${gearType}`, isChecked);
        this.render(false);
    }
    
    /**
     * Handle Days on Road increase with all associated effects
     */
    async _onDaysOnRoadIncrease() {
        const weather = this.actor.getFlag('wfrp4e-travel-system', 'weather.current') || {};
        const status = this.actor.getFlag('wfrp4e-travel-system', 'travel.status');
        const provisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.provisions') || 0;
        const hunger = this.actor.getFlag('wfrp4e-travel-system', 'resources.hunger') || 0;
        const exposure = this.actor.getFlag('wfrp4e-travel-system', 'resources.exposure') || 0;
        const linkedCharacters = this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || [];
        const hasMounts = this.actor.getFlag('wfrp4e-travel-system', 'travel.hasMounts') || false;
        const isGrazing = this.actor.getFlag('wfrp4e-travel-system', 'travel.mountsGrazing') || false;
        const mountProvisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.mountProvisions') || 0;
        const partySize = linkedCharacters.length;
        
        // Calculate provisions needed (2x if Sweltering/Bitter)
        const isExtremeTempProvisions = (weather.temperature === 'sweltering' || weather.temperature === 'bitter');
        const provisionsNeeded = isExtremeTempProvisions ? 2 : 1; // 1 provision feeds whole party
        
        // Check if mount provisions needed
        const mountProvisionsNeeded = (hasMounts && !isGrazing) ? 1 : 0;
        
        // Check for blizzard
        const extremeWeather = this._checkExtremeWeather();
        const isBlizzard = extremeWeather.type === 'blizzard';
        const isTraveling = status === 'traveling';
        
        // Build confirmation message
        let confirmMsg = `<h3>Advance 1 Day</h3><ul>`;
        
        // Provisions
        if (provisions >= provisionsNeeded) {
            confirmMsg += `<li>Consume ${provisionsNeeded} provisions${isExtremeTempProvisions ? ` (2x due to ${this._capitalizeWeather(weather.temperature)} temperature)` : ''}</li>`;
        } else {
            confirmMsg += `<li><strong style="color: #d32f2f;">⚠ Provisions exhausted!</strong> Hunger will increase by +1</li>`;
        }
        
        // Mount Provisions
        if (mountProvisionsNeeded > 0) {
            if (mountProvisions >= mountProvisionsNeeded) {
                confirmMsg += `<li>Consume ${mountProvisionsNeeded} mount provisions</li>`;
            } else {
                confirmMsg += `<li><strong style="color: #d32f2f;">⚠ Mount provisions exhausted!</strong></li>`;
            }
        }
        
        // Hunger recovery
        if (hunger > 0 && provisions >= provisionsNeeded) {
            confirmMsg += `<li>Hunger satisfied (reset to 0)</li>`;
        }
        
        // Blizzard JP cost
        const jp = this.actor.getFlag('wfrp4e-travel-system', 'resources.journeyPool.current') || 0;
        if (isBlizzard && isTraveling) {
            if (jp > 0) {
                confirmMsg += `<li>Blizzard: Spend 1 Journey Pool</li>`;
            } else {
                confirmMsg += `<li><strong style="color: #ff9800;">⚠ JP exhausted!</strong> Gain +1 weariness from blizzard travel</li>`;
            }
        }
        
        // Daily weariness
        const dailyWeariness = hunger + exposure;
        if (dailyWeariness > 0) {
            confirmMsg += `<li>Daily strain: +${dailyWeariness} weariness (Hunger: ${hunger}, Exposure: ${exposure})</li>`;
        }
        
        confirmMsg += `</ul><p>Continue?</p>`;
        
        // Show confirmation dialog
        const confirmed = await Dialog.confirm({
            title: "Advance Days on Road",
            content: confirmMsg,
            defaultYes: true
        });
        
        if (!confirmed) return;
        
        // Execute all steps
        const summary = [];
        
        // Step 1: Consume provisions
        let newProvisions = provisions;
        let newHunger = hunger;
        if (provisions >= provisionsNeeded) {
            newProvisions = provisions - provisionsNeeded;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.provisions', newProvisions);
            summary.push(`Consumed ${provisionsNeeded} provisions${isExtremeTempProvisions ? ` (2x rate)` : ''}`);
        } else {
            newProvisions = 0;
            newHunger = hunger + 1;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.provisions', 0);
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.hunger', newHunger);
            summary.push(`⚠ Provisions exhausted! Hunger increased to ${newHunger}`);
        }
        
        // Step 1b: Consume mount provisions (if needed)
        if (mountProvisionsNeeded > 0) {
            if (mountProvisions >= mountProvisionsNeeded) {
                const newMountProvisions = mountProvisions - mountProvisionsNeeded;
                await this.actor.setFlag('wfrp4e-travel-system', 'resources.mountProvisions', newMountProvisions);
                summary.push(`Consumed ${mountProvisionsNeeded} mount provisions`);
            } else {
                await this.actor.setFlag('wfrp4e-travel-system', 'resources.mountProvisions', 0);
                summary.push(`⚠ Mount provisions exhausted!`);
            }
        }
        
        // Step 2: Check hunger recovery
        if (hunger > 0 && newProvisions > 0) {
            newHunger = 0;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.hunger', 0);
            summary.push(`Hunger satisfied (reset to 0)`);
        }
        
        // Step 3: Gain exposure based on weather conditions
        const exposureCalc = this._calculateExposure();
        const exposureGain = isTraveling ? exposureCalc.travelingExposure : exposureCalc.campingExposure;
        let newExposure = exposure;
        if (exposureGain > 0) {
            newExposure = exposure + exposureGain;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.exposure', newExposure);
            summary.push(`Gained +${exposureGain} exposure (${isTraveling ? 'traveling' : 'camping'})`);
        }
        
        // Step 4: Blizzard JP cost
        let blizzardWeariness = 0;
        if (isBlizzard && isTraveling) {
            if (jp > 0) {
                await this.actor.setFlag('wfrp4e-travel-system', 'resources.journeyPool.current', jp - 1);
                summary.push(`Blizzard: Spent 1 JP`);
            } else {
                blizzardWeariness = 1;
                summary.push(`⚠ JP exhausted! Gained +1 weariness`);
            }
        }
        
        // Step 5: Daily weariness from hunger + exposure + blizzard
        let totalWearinessGain = newHunger + newExposure + blizzardWeariness;
        if (totalWearinessGain > 0) {
            let parts = [];
            if (newHunger > 0) parts.push(`Hunger: ${newHunger}`);
            if (newExposure > 0) parts.push(`Exposure: ${newExposure}`);
            if (blizzardWeariness > 0) parts.push(`Blizzard: ${blizzardWeariness}`);
            summary.push(`Daily strain: +${totalWearinessGain} weariness (${parts.join(', ')})`);
        }
        
        // Step 6: Apply weariness and handle overflow to Travel Fatigue
        // Always check for overflow, even if no new weariness (in case current > threshold)
        if (totalWearinessGain > 0) {
            const result = await this._addWeariness(totalWearinessGain);
            if (result.fatigueGained > 0) {
                summary.push(`⚠ Weariness overflow! Gained +${result.fatigueGained} Travel Fatigue (${result.newWeariness} weariness remaining)`);
            }
        } else {
            // No new weariness, but check if current weariness needs conversion
            const currentWeariness = this.actor.getFlag('wfrp4e-travel-system', 'resources.weariness') || 0;
            if (currentWeariness > 0) {
                const result = await this._addWeariness(0); // Force overflow check
                if (result.fatigueGained > 0) {
                    summary.push(`⚠ Weariness overflow! Gained +${result.fatigueGained} Travel Fatigue (${result.newWeariness} weariness remaining)`);
                }
            }
        }
        
        // Step 7: Apply exposure damage to characters (if exposure > TB)
        const woundedCharacters = [];
        for (const charData of linkedCharacters) {
            const char = game.actors.get(charData);
            if (!char) continue;
            
            const tb = char.system.characteristics.t.bonus;
            const exposureWarning = newExposure - tb;
            
            if (exposureWarning > 0) {
                const currentWounds = char.system.status.wounds.value;
                const maxWounds = char.system.status.wounds.max;
                const woundDamage = exposureWarning;
                const newWounds = Math.max(0, currentWounds - woundDamage);
                
                await char.update({'system.status.wounds.value': newWounds});
                woundedCharacters.push(`${char.name}: -${woundDamage} wounds (${newWounds}/${maxWounds})`);
            }
        }
        
        if (woundedCharacters.length > 0) {
            summary.push(`⚠ <strong>Exposure damage:</strong><br>${woundedCharacters.join('<br>')}`);
        }
        
        // Step 8: Increase Days on Road
        const currentDays = this.actor.getFlag('wfrp4e-travel-system', 'journey.daysOnRoad') || 0;
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.daysOnRoad', currentDays + 1);
        
        // Show consolidated notification
        ui.notifications.info(`<strong>Day ${currentDays + 1}</strong><br>` + summary.join('<br>'));
        
        // Re-render sheet
        this.render(false);
    }
}
