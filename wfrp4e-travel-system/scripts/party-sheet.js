/**
 * WFRP4e Travel System - Party Sheet
 * Custom Actor Sheet for Party Travel Management
 * 
 * Structure:
 * 1. Class Definition & Configuration
 * 2. Data Management (getData, initialization)
 * 3. Helper/Calculation Methods
 * 4. Event Handlers
 * 5. Weather System
 * 6. Event System
 * 7. Daily Processing
 */

export class PartySheet extends ActorSheet {
    
    // ========================================
    // SECTION 1: CLASS CONFIGURATION
    // ========================================
    
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['wfrp4e', 'sheet', 'actor', 'party-sheet'],
            template: 'modules/wfrp4e-travel-system/templates/party-sheet.html',
            width: 800,
            height: 720,
            tabs: [{
                navSelector: '.sheet-tabs',
                contentSelector: '.sheet-body',
                initial: 'overview'
            }],
            dragDrop: [{ dragSelector: null, dropSelector: null }],
            scrollY: ['.tab-content']
        });
    }
    
    get template() {
        return 'modules/wfrp4e-travel-system/templates/party-sheet.html';
    }
    
    // ========================================
    // SECTION 2: DATA MANAGEMENT
    // ========================================
    
    async getData() {
        const context = super.getData();
        
        // Initialize party data if needed
        let partyFlags = this.actor.flags['wfrp4e-travel-system'];
        if (!partyFlags?.isPartyActor) {
            await this._initializePartyData();
            partyFlags = this.actor.flags['wfrp4e-travel-system'];
        }
        
        // Core data
        context.isPartyActor = partyFlags.isPartyActor || false;
        context.journey = partyFlags.journey || {};
        context.resources = partyFlags.resources || {};
        context.travel = partyFlags.travel || {};
        context.weather = partyFlags.weather || {};
        
        // Linked characters
        context.linkedCharacters = this._getLinkedCharacters(partyFlags.linkedCharacters || []);
        
        // Calculate derived values
        if (context.linkedCharacters.length > 0) {
            context.resources.wearinessThreshold = this._calculateWearinessThreshold(context.linkedCharacters);
            if (context.travel.hasMounts) {
                context.resources.wearinessThreshold += 2;
            }
        }
        
        // Journey Pool maximum
        const baseJPMax = 10;
        const travelFatigue = context.resources.travelFatigue || 0;
        const dangerRating = context.journey.dangerRating || 0;
        context.resources.journeyPool.max = Math.max(0, baseJPMax - travelFatigue - dangerRating);
        
        // Camp data
        this._initializeCampData(partyFlags, context);
        
        // Weather data
        this._initializeWeatherData(partyFlags, context);
        
        // Events data
        this._initializeEventsData(partyFlags, context);
        
        // System info
        context.isGM = game.user.isGM;
        context.editable = this.isEditable;
        
        return context;
    }
    
    async _initializePartyData() {
        const defaultData = {
            isPartyActor: true,
            linkedCharacters: [],
            journey: {
                destination: '',
                hexesRemaining: 0,
                hexesUntilEvent: 0,
                daysOnRoad: 0,
                dangerRating: 0,
                phase: 'preparation',
                dangerFactors: {
                    monsterLairs: false,
                    activeThreats: false,
                    unwelcoming: false,
                    recentDisaster: false
                }
            },
            resources: {
                provisions: 0,
                campSupplies: 0,
                mountProvisions: 0,
                hunger: 0,
                exposure: 0,
                weariness: 0,
                travelFatigue: 0,
                journeyPool: { current: 10, max: 10 },
                preparedness: 0,
                consumables: {
                    meticulousPlanning: 0,
                    specializedEquipment: 0,
                    updatedMaps: 0
                }
            },
            travel: {
                status: 'camping',
                hasMounts: false,
                mountsGrazing: false
            },
            camp: { tasks: {} },
            weather: {
                conditions: { climate: 'temperate', season: 'summer', terrain: 'plains' },
                current: { temperature: 'comfortable', precipitation: 'none', visibility: 'clear', wind: 'gentle' },
                gear: { weatherAppropriateGear: false, campSetup: false }
            },
            events: { modifier: 0, lastRoll: null }
        };
        
        await this.actor.setFlag('wfrp4e-travel-system', 'isPartyActor', defaultData.isPartyActor);
        await this.actor.setFlag('wfrp4e-travel-system', 'linkedCharacters', defaultData.linkedCharacters);
        await this.actor.setFlag('wfrp4e-travel-system', 'journey', defaultData.journey);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources', defaultData.resources);
        await this.actor.setFlag('wfrp4e-travel-system', 'travel', defaultData.travel);
        await this.actor.setFlag('wfrp4e-travel-system', 'camp', defaultData.camp);
        await this.actor.setFlag('wfrp4e-travel-system', 'weather', defaultData.weather);
        await this.actor.setFlag('wfrp4e-travel-system', 'events', defaultData.events);
    }
    
    _initializeCampData(partyFlags, context) {
        if (!partyFlags.camp) {
            partyFlags.camp = { tasks: {} };
        }
        context.camp = partyFlags.camp || { tasks: {} };
        
        if (!context.camp.tasks) {
            context.camp.tasks = {};
        }
        
        // Build watch list
        const watchingCharacters = [];
        const recuperatingCharacters = [];
        
        for (const char of context.linkedCharacters) {
            const task = context.camp.tasks[char.id];
            if (task?.keepingWatch) {
                if (task.selectedAction === 'recuperate') {
                    recuperatingCharacters.push(char.name);
                } else {
                    watchingCharacters.push({ name: char.name, action: task.selectedAction });
                }
            }
        }
        
        for (const char of watchingCharacters) {
            const task = context.camp.tasks[char.id];
            if (task?.selectedAction === 'recuperate') {
                recuperatingCharacters.push(char.name);
            }
        }
        
        context.camp.watchList = watchingCharacters;
        context.camp.watchCount = watchingCharacters.length;
        context.camp.recuperatingList = recuperatingCharacters;
    }
    
    _initializeWeatherData(partyFlags, context) {
        // Ensure weather structure exists
        if (!context.weather.conditions) {
            context.weather.conditions = { climate: 'temperate', season: 'summer', terrain: 'plains' };
        }
        if (!context.weather.current) {
            context.weather.current = { temperature: 'comfortable', precipitation: 'none', visibility: 'clear', wind: 'gentle' };
        }
        if (!context.weather.gear) {
            context.weather.gear = { weatherAppropriateGear: false, campSetup: false };
        }
        
        // Check extreme weather
        const extremeWeather = this._checkExtremeWeather();
        context.weather.isBlizzard = extremeWeather.type === 'blizzard';
        context.weather.isExtremeCold = extremeWeather.type === 'extreme-cold';
        context.weather.isThunderStorm = extremeWeather.type === 'thunder-storm';
        
        // Calculate exposure
        const exposure = this._calculateExposure();
        context.weather.exposure = {
            traveling: exposure.travelingExposure,
            camping: exposure.campingExposure,
            explanation: exposure.explanation,
            daily: partyFlags.travel?.status === 'traveling' ? exposure.travelingExposure : exposure.campingExposure
        };
        
        // Build active effects list
        this._buildWeatherEffects(context);
        
        // Weather warnings for Overview
        context.weather.extremeTempProvisions = (
            context.weather.current.temperature === 'sweltering' || 
            context.weather.current.temperature === 'bitter'
        );
        context.weather.blizzardTraveling = (
            context.weather.isBlizzard && 
            partyFlags.travel?.status === 'traveling'
        );
    }
    
    _buildWeatherEffects(context) {
        const activeEffects = [];
        const temp = context.weather.current.temperature;
        const precip = context.weather.current.precipitation;
        const isTraveling = context.weather.gear?.weatherAppropriateGear;
        const hasCampSetup = context.weather.gear?.campSetup;
        
        // Temperature effects
        if (temp === 'sweltering' || temp === 'bitter') {
            activeEffects.push('2x provisions usage');
            activeEffects.push('+2 weariness on event trigger');
        } else if (temp === 'hot' || temp === 'chilly') {
            activeEffects.push('+1 weariness on event trigger');
        }
        
        // Precipitation effects (with cold temps)
        if ((temp === 'chilly' || temp === 'bitter') && precip !== 'none') {
            const weariness = { 'light': 1, 'heavy': 2, 'very-heavy': 3 }[precip];
            if (weariness) {
                activeEffects.push(`+${weariness} weariness on event trigger`);
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
        
        // Extreme weather effects
        if (context.weather.isBlizzard) {
            activeEffects.push('⚠ BLIZZARD: Movement -50%, Must spend 1 JP/day (or +1 weariness)');
        } else if (context.weather.isExtremeCold) {
            activeEffects.push('⚠ EXTREME COLD: Exposure gain');
        } else if (context.weather.isThunderStorm) {
            if (isTraveling) {
                activeEffects.push(hasCampSetup ? '⚠ THUNDER STORM: +1 weariness/day (with gear, traveling)' : '⚠ THUNDER STORM: +2 weariness/day (without gear, traveling)');
            } else {
                activeEffects.push(hasCampSetup ? '⚠ THUNDER STORM: No weariness (camp setup)' : '⚠ THUNDER STORM: +1 weariness/day (no camp setup)');
            }
        }
        
        context.weather.activeEffects = activeEffects.length > 0 ? activeEffects : null;
    }
    
    _initializeEventsData(partyFlags, context) {
        if (!partyFlags.events) {
            partyFlags.events = { modifier: 0, lastRoll: null };
        }
        context.events = partyFlags.events || { modifier: 0, lastRoll: null };
        context.events.eventTable = this._getEventTable();
        
        // Highlight rolled event
        if (context.events.lastRoll) {
            const rollTotal = context.events.lastRoll.total;
            context.events.eventTable.forEach(row => {
                row.highlighted = (rollTotal >= row.min && rollTotal <= row.max);
            });
        }
    }
    
    async _render(force, options) {
        await super._render(force, options);
        
        // Auto-expand first task panel
        setTimeout(() => {
            const firstTaskPanel = this.element.find('.task-panel').first();
            if (firstTaskPanel.length && !firstTaskPanel.hasClass('expanded')) {
                firstTaskPanel.addClass('expanded');
            }
        }, 100);
    }
    
    // ========================================
    // SECTION 3: HELPER & CALCULATION METHODS
    // ========================================
    
    _getLinkedCharacters(characterIds) {
        if (!Array.isArray(characterIds)) return [];
        
        return characterIds.map(id => {
            const actor = game.actors.get(id);
            if (!actor) return null;
            
            const system = actor.system;
            const characteristics = system.characteristics;
            const tb = characteristics?.t?.bonus || 0;
            const maxWounds = system.status?.wounds?.max || 0;
            const currentWounds = system.status?.wounds?.value || 0;
            
            return {
                id: actor.id,
                name: actor.name,
                img: actor.img,
                tb: tb,
                wounds: { current: currentWounds, max: maxWounds }
            };
        }).filter(char => char !== null);
    }
    
    _calculateWearinessThreshold(characters) {
        if (!characters || characters.length === 0) return 3;
        
        const totalTB = characters.reduce((sum, char) => sum + (char.tb || 0), 0);
        const avgTB = Math.floor(totalTB / characters.length);
        return Math.max(1, avgTB);
    }
    
    async _addWeariness(amount) {
        const currentWeariness = this.actor.getFlag('wfrp4e-travel-system', 'resources.weariness') || 0;
        const characters = this._getLinkedCharacters(this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || []);
        
        let wearinessThreshold = this._calculateWearinessThreshold(characters);
        if (this.actor.getFlag('wfrp4e-travel-system', 'travel.hasMounts')) {
            wearinessThreshold += 2;
        }
        
        if (wearinessThreshold <= 0) wearinessThreshold = 1;
        
        const totalWeariness = currentWeariness + amount;
        let fatigueGained = 0;
        let newWeariness = totalWeariness;
        
        // Convert overflow to Travel Fatigue
        if (totalWeariness > wearinessThreshold) {
            fatigueGained = Math.floor((totalWeariness - 1) / wearinessThreshold);
            newWeariness = ((totalWeariness - 1) % wearinessThreshold) + 1;
        }
        
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.weariness', newWeariness);
        
        if (fatigueGained > 0) {
            const currentFatigue = this.actor.getFlag('wfrp4e-travel-system', 'resources.travelFatigue') || 0;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.travelFatigue', currentFatigue + fatigueGained);
        }
        
        return { newWeariness, fatigueGained };
    }
    
    _formatCurrency(totalBrass, totalSilver) {
        totalBrass = totalBrass || 0;
        totalSilver = totalSilver || 0;
        
        let brass = totalBrass;
        let silver = totalSilver;
        
        // Convert brass to silver (12bp = 1ss)
        silver += Math.floor(brass / 12);
        brass = brass % 12;
        
        // Convert silver to gold (20ss = 1gc)
        const gold = Math.floor(silver / 20);
        silver = silver % 20;
        
        const parts = [];
        if (gold > 0) parts.push(`${gold} gc`);
        if (silver > 0) parts.push(`${silver} ss`);
        if (brass > 0) parts.push(`${brass} bp`);
        
        return parts.length > 0 ? parts.join(' ') : '0 bp';
    }
    
    _capitalizeWeather(str) {
        return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    
    // ========================================
    // SECTION 4: EVENT HANDLERS
    // ========================================
    
    activateListeners(html) {
        super.activateListeners(html);
        
        if (!this.isEditable) return;
        
        // Character management
        html.find('.remove-character').click(this._onRemoveCharacter.bind(this));
        
        // Resource controls
        html.find('.resource-control').click(this._onResourceControl.bind(this));
        
        // Travel options
        html.find('.travel-option-toggle').change(this._onTravelOptionToggle.bind(this));
        
        // Phase controls
        html.find('.phase-control').click(this._onPhaseControl.bind(this));
        html.find('[data-action="cycle-phase"]').on('click contextmenu', this._onPhaseCycle.bind(this));
        
        // Danger factors
        html.find('.danger-factor').change(this._onDangerFactorChange.bind(this));
        
        // Status toggle
        html.find('[data-action="toggle-status"]').click(this._onStatusToggle.bind(this));
        
        // Hexes until event
        html.find('[data-action="roll-hexes"]').click(this._onRollHexesUntilEvent.bind(this));
        
        // Action buttons
        html.find('.action-button').click(this._onActionRoll.bind(this));
        
        // Reset consumables
        html.find('.reset-consumables-btn').click(this._onResetConsumables.bind(this));
        
        // Watch toggle
        html.find('.watch-toggle').click(this._onWatchToggle.bind(this));
        
        // Task actions
        html.find('.task-action-select').change(this._onTaskActionChange.bind(this));
        
        // Weather controls
        html.find('.generate-weather-btn').click(this._generateWeather.bind(this));
        html.find('.weather-condition-select').change(this._onWeatherConditionChange.bind(this));
        html.find('.weather-override-select').change(this._onWeatherOverride.bind(this));
        html.find('.weather-gear-checkbox').change(this._onWeatherGearChange.bind(this));
        
        // Event controls
        html.find('.modifier-btn').click(this._onModifierChange.bind(this));
        html.find('.roll-event-btn').click(this._onRollEvent.bind(this));
    }
    
    async _onDrop(event) {
        event.preventDefault();
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        
        if (data.type !== 'Actor') return;
        
        const actor = await fromUuid(data.uuid);
        if (!actor || actor.type !== 'character') {
            ui.notifications.warn('Only character actors can be added to the party.');
            return;
        }
        
        const linkedCharacters = this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || [];
        if (linkedCharacters.includes(actor.id)) {
            ui.notifications.info(`${actor.name} is already in the party.`);
            return;
        }
        
        linkedCharacters.push(actor.id);
        await this.actor.setFlag('wfrp4e-travel-system', 'linkedCharacters', linkedCharacters);
        
        setTimeout(() => this.render(false), 100);
    }
    
    async _onRemoveCharacter(event) {
        event.preventDefault();
        const characterId = event.currentTarget.dataset.characterId;
        
        let linkedCharacters = this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || [];
        linkedCharacters = linkedCharacters.filter(id => id !== characterId);
        
        await this.actor.setFlag('wfrp4e-travel-system', 'linkedCharacters', linkedCharacters);
        setTimeout(() => this.render(false), 100);
    }
    
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
        
        // Special handling for weariness
        if (resourcePath === 'resources.weariness') {
            if (action === 'increase') {
                const result = await this._addWeariness(1);
                if (result.fatigueGained > 0) {
                    ui.notifications.info(`Weariness overflow! +${result.fatigueGained} Travel Fatigue (${result.newWeariness} weariness remaining)`);
                }
            } else {
                const current = this.actor.getFlag('wfrp4e-travel-system', resourcePath) || 0;
                await this.actor.setFlag('wfrp4e-travel-system', resourcePath, Math.max(0, current - 1));
            }
            this.render(false);
            return;
        }
        
        // Special handling for Meticulous Planning
        if (resourcePath === 'resources.consumables.meticulousPlanning') {
            await this._adjustPreparednessForConsumable(resourcePath, action);
            return;
        }
        
        const current = this.actor.getFlag('wfrp4e-travel-system', resourcePath) || 0;
        const currentPhase = this.actor.getFlag('wfrp4e-travel-system', 'journey.phase');
        
        // Calculate cost for preparation phase increases
        let ppCost = 0;
        if (currentPhase === 'preparation') {
            if (resourcePath === 'resources.provisions') ppCost = 10;
            else if (resourcePath === 'resources.campSupplies') ppCost = 10;
            else if (resourcePath === 'resources.mountProvisions') ppCost = 5;
        }
        
        // Apply change
        if (action === 'increase') {
            await this.actor.setFlag('wfrp4e-travel-system', resourcePath, current + 1);
        } else {
            await this.actor.setFlag('wfrp4e-travel-system', resourcePath, Math.max(0, current - 1));
        }
        
        // Deduct preparedness cost
        if (currentPhase === 'preparation' && ppCost && action === 'increase') {
            const currentPreparedness = this.actor.getFlag('wfrp4e-travel-system', 'resources.preparedness') || 0;
            if (currentPreparedness >= ppCost) {
                await this.actor.setFlag('wfrp4e-travel-system', 'resources.preparedness', currentPreparedness - ppCost);
            }
        }
        
        // Handle consumable brass cost refund
        if (button.classList.contains('consumable-btn') && action === 'decrease') {
            await this._adjustPreparednessForConsumable(resourcePath, action);
        }
        
        this.render(false);
    }
    
    async _adjustPreparednessForConsumable(resourcePath, action) {
        const costs = {
            'resources.consumables.specializedEquipment': { brass: 600, silver: 0 },
            'resources.consumables.updatedMaps': { brass: 240, silver: 0 }
        };
        
        const cost = costs[resourcePath];
        if (!cost) return;
        
        const current = this.actor.getFlag('wfrp4e-travel-system', resourcePath) || 0;
        
        if (action === 'increase') {
            await this.actor.setFlag('wfrp4e-travel-system', resourcePath, current + 1);
        } else {
            const currentPreparedness = this.actor.getFlag('wfrp4e-travel-system', 'resources.preparedness') || 0;
            await this.actor.setFlag('wfrp4e-travel-system', resourcePath, Math.max(0, current - 1));
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.preparedness', currentPreparedness + 50);
        }
        
        this.render(false);
    }
    
    async _onTravelOptionToggle(event) {
        const toggle = event.currentTarget;
        const option = toggle.dataset.option;
        const checked = toggle.checked;
        
        await this.actor.setFlag('wfrp4e-travel-system', `travel.${option}`, checked);
        this.render(false);
    }
    
    async _onPhaseControl(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const newPhase = button.dataset.phase;
        
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.phase', newPhase);
        this.render(false);
    }
    
    async _onPhaseCycle(event) {
        event.preventDefault();
        const phases = ['preparation', 'traveling', 'camping'];
        const currentPhase = this.actor.getFlag('wfrp4e-travel-system', 'journey.phase') || 'preparation';
        const currentIndex = phases.indexOf(currentPhase);
        
        let newIndex;
        if (event.type === 'contextmenu') {
            newIndex = (currentIndex - 1 + phases.length) % phases.length;
        } else {
            newIndex = (currentIndex + 1) % phases.length;
        }
        
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.phase', phases[newIndex]);
        this.render(false);
    }
    
    async _onDangerFactorChange(event) {
        const checkbox = event.currentTarget;
        const factor = checkbox.dataset.factor;
        const checked = checkbox.checked;
        
        await this.actor.setFlag('wfrp4e-travel-system', `journey.dangerFactors.${factor}`, checked);
        
        // Recalculate danger rating
        const factors = this.actor.getFlag('wfrp4e-travel-system', 'journey.dangerFactors') || {};
        const count = Object.values(factors).filter(v => v === true).length;
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.dangerRating', count);
        
        this.render(false);
    }
    
    async _onStatusToggle(event) {
        event.preventDefault();
        const currentStatus = this.actor.getFlag('wfrp4e-travel-system', 'travel.status') || 'camping';
        const newStatus = currentStatus === 'traveling' ? 'camping' : 'traveling';
        
        await this.actor.setFlag('wfrp4e-travel-system', 'travel.status', newStatus);
        this.render(false);
    }
    
    async _onRollHexesUntilEvent() {
        const roll = await new Roll('1d6').roll({async: true});
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.hexesUntilEvent', roll.total);
        
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: 'Hexes Until Event'
        });
        
        this.render(false);
    }
    
    async _onActionRoll(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const actionName = button.dataset.action;
        const skillName = button.dataset.skill;
        const characteristicKey = button.dataset.characteristic;
        const jpCost = parseInt(button.dataset.jpCost) || 0;
        const wearinessCost = parseInt(button.dataset.wearinessCost) || 0;
        
        const linkedCharacters = this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || [];
        
        if (linkedCharacters.length === 0) {
            ui.notifications.warn('No characters in the party to perform this action.');
            return;
        }
        
        let options = {};
        linkedCharacters.forEach(charId => {
            const char = game.actors.get(charId);
            if (char) {
                options[char.id] = char.name;
            }
        });
        
        const characterId = await new Promise((resolve) => {
            new Dialog({
                title: `Choose Character for ${actionName}`,
                content: `
                    <form>
                        <div class="form-group">
                            <label>Select Character:</label>
                            <select id="character-select" style="width: 100%;">
                                ${Object.entries(options).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}
                            </select>
                        </div>
                    </form>
                `,
                buttons: {
                    roll: {
                        label: 'Roll',
                        callback: (html) => resolve(html.find('#character-select').val())
                    },
                    cancel: {
                        label: 'Cancel',
                        callback: () => resolve(null)
                    }
                },
                default: 'roll'
            }).render(true);
        });
        
        if (!characterId) return;
        
        const actor = game.actors.get(characterId);
        if (!actor) return;
        
        // Setup test
        let setupData = {
            title: actionName,
            appendTitle: ` - ${actionName}`
        };
        
        if (skillName) {
            setupData.skillSelected = skillName;
        } else if (characteristicKey) {
            setupData.characteristicToUse = characteristicKey;
        }
        
        await actor.setupSkill(skillName || actor.system.characteristics[characteristicKey], setupData);
    }
    
    async _onResetConsumables() {
        const currentPreparedness = this.actor.getFlag('wfrp4e-travel-system', 'resources.preparedness') || 0;
        
        const mp = this.actor.getFlag('wfrp4e-travel-system', 'resources.consumables.meticulousPlanning') || 0;
        const se = this.actor.getFlag('wfrp4e-travel-system', 'resources.consumables.specializedEquipment') || 0;
        const um = this.actor.getFlag('wfrp4e-travel-system', 'resources.consumables.updatedMaps') || 0;
        
        const refund = (mp * 25) + (se * 50) + (um * 50);
        
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.meticulousPlanning', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.specializedEquipment', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.consumables.updatedMaps', 0);
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.preparedness', currentPreparedness + refund);
        
        ui.notifications.info(`Consumables reset. Preparedness refund: ${refund} PP`);
        this.render(false);
    }
    
    async _onWatchToggle(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const characterId = button.dataset.characterId;
        
        const tasks = this.actor.getFlag('wfrp4e-travel-system', 'camp.tasks') || {};
        
        if (!tasks[characterId]) {
            tasks[characterId] = { keepingWatch: false, selectedAction: 'recuperate' };
        }
        
        tasks[characterId].keepingWatch = !tasks[characterId].keepingWatch;
        
        await this.actor.setFlag('wfrp4e-travel-system', 'camp.tasks', tasks);
        this.render(false);
    }
    
    async _onTaskActionChange(event) {
        const select = event.currentTarget;
        const characterId = select.dataset.characterId;
        const selectedAction = select.value;
        
        const tasks = this.actor.getFlag('wfrp4e-travel-system', 'camp.tasks') || {};
        
        if (!tasks[characterId]) {
            tasks[characterId] = { keepingWatch: false, selectedAction: 'recuperate' };
        }
        
        tasks[characterId].selectedAction = selectedAction;
        
        await this.actor.setFlag('wfrp4e-travel-system', 'camp.tasks', tasks);
        this.render(false);
    }
    
    async _onModifierChange(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const action = button.dataset.action;
        
        const currentModifier = this.actor.getFlag('wfrp4e-travel-system', 'events.modifier') || 0;
        let newModifier = currentModifier;
        
        if (action === 'increase') {
            newModifier = Math.min(50, currentModifier + 10);
        } else if (action === 'decrease') {
            newModifier = Math.max(-50, currentModifier - 10);
        }
        
        await this.actor.setFlag('wfrp4e-travel-system', 'events.modifier', newModifier);
        this.render(false);
    }
    
    async _onRollEvent(event) {
        event.preventDefault();
        
        const modifier = this.actor.getFlag('wfrp4e-travel-system', 'events.modifier') || 0;
        const roll = await new Roll('1d100').roll({async: true});
        const baseResult = roll.total;
        const finalResult = baseResult + modifier;
        
        await this.actor.setFlag('wfrp4e-travel-system', 'events.lastRoll', {
            base: baseResult,
            modifier: modifier,
            total: finalResult
        });
        
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: `<h3>Event Roll</h3><p>Base: ${baseResult} + Modifier: ${modifier} = <strong>${finalResult}</strong></p><p><em>GM: Reference event table for result</em></p>`
        });
        
        this.render(false);
    }
    
    // ========================================
    // SECTION 5: WEATHER SYSTEM
    // ========================================
    
    async _generateWeather() {
        const conditions = this.actor.getFlag('wfrp4e-travel-system', 'weather.conditions') || {};
        const terrain = conditions.terrain || 'plains';
        
        const seasonMod = { spring: 2, summer: 0, autumn: 2, winter: 4 }[conditions.season] || 0;
        const climateMod = { hot: -2, temperate: 0, cold: 2 }[conditions.climate] || 0;
        const terrainMod = (terrain === 'mountains') ? 1 : 0;
        
        // Roll temperature
        const tempRoll = await new Roll('1d10').roll({async: true});
        const tempResult = tempRoll.total + seasonMod + climateMod + terrainMod;
        const temperature = this._getTemperature(tempResult);
        
        // Roll precipitation
        const precipRoll = await new Roll('1d10').roll({async: true});
        const precipResult = precipRoll.total + seasonMod;
        const precipitation = this._getPrecipitation(precipResult);
        
        // Roll visibility (can be overridden)
        const visRoll = await new Roll('1d10').roll({async: true});
        let visibility = this._getVisibility(visRoll.total);
        
        // Roll wind
        const windRoll = await new Roll('1d10').roll({async: true});
        const windResult = windRoll.total + (terrain === 'mountains' ? 2 : 0);
        const wind = this._getWind(windResult);
        
        // Override visibility for heavy precipitation
        if (precipitation === 'heavy') visibility = 'moderate';
        if (precipitation === 'very-heavy') visibility = 'poor';
        
        // Check for blizzard
        if (temperature === 'bitter' && precipitation === 'very-heavy') {
            visibility = 'poor';
        }
        
        await this.actor.setFlag('wfrp4e-travel-system', 'weather.current', {
            temperature, precipitation, visibility, wind
        });
        
        this.render(false);
    }
    
    _getTemperature(result) {
        const table = {
            1: 'sweltering', 2: 'sweltering', 3: 'hot', 4: 'hot',
            5: 'comfortable', 6: 'comfortable', 7: 'comfortable',
            8: 'chilly', 9: 'chilly', 10: 'bitter', 11: 'bitter', 12: 'bitter'
        };
        return result >= 13 ? 'bitter' : (table[result] || 'comfortable');
    }
    
    _getPrecipitation(result) {
        const table = {
            1: 'none', 2: 'none', 3: 'none', 4: 'none', 5: 'none',
            6: 'light', 7: 'light', 8: 'light',
            9: 'heavy', 10: 'heavy', 11: 'very-heavy', 12: 'very-heavy'
        };
        return result >= 13 ? 'very-heavy' : (table[result] || 'none');
    }
    
    _getVisibility(result) {
        const table = {
            1: 'clear', 2: 'clear', 3: 'clear', 4: 'clear', 5: 'clear',
            6: 'clear', 7: 'moderate', 8: 'moderate',
            9: 'poor', 10: 'poor', 11: 'moderate', 12: 'clear'
        };
        return result >= 13 ? 'clear' : (table[result] || 'clear');
    }
    
    _getWind(result) {
        const table = {
            1: 'still', 2: 'gentle', 3: 'gentle', 4: 'moderate', 5: 'moderate', 6: 'moderate',
            7: 'strong', 8: 'strong', 9: 'very-strong', 10: 'very-strong',
            11: 'moderate', 12: 'gentle'
        };
        return result >= 13 ? 'still' : (table[result] || 'moderate');
    }
    
    _checkExtremeWeather() {
        const weather = this.actor.getFlag('wfrp4e-travel-system', 'weather.current') || {};
        
        const isBlizzard = (weather.temperature === 'bitter' && weather.precipitation === 'very-heavy');
        const isExtremeCold = ((weather.temperature === 'chilly' || weather.temperature === 'bitter') &&
            (weather.precipitation === 'heavy' || weather.precipitation === 'very-heavy') &&
            (weather.wind === 'strong' || weather.wind === 'very-strong'));
        const isThunderStorm = ((weather.precipitation === 'heavy' || weather.precipitation === 'very-heavy') &&
            (weather.wind === 'strong' || weather.wind === 'very-strong'));
        
        // Precedence: Thunder Storm + Extreme Cold = Blizzard
        if (isThunderStorm && isExtremeCold) return { type: 'blizzard', isExtreme: true };
        if (isBlizzard) return { type: 'blizzard', isExtreme: true };
        if (isExtremeCold) return { type: 'extreme-cold', isExtreme: true };
        if (isThunderStorm) return { type: 'thunder-storm', isExtreme: true };
        
        return { type: 'normal', isExtreme: false };
    }
    
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
            explanation = `Blizzard conditions: ${travelingExposure} exposure/day when traveling. ${campingExposure} exposure/day when camping.`;
        } else if (extremeWeather.type === 'extreme-cold') {
            travelingExposure = gear.weatherAppropriateGear ? 1 : 3;
            campingExposure = gear.campSetup ? 0 : travelingExposure;
            explanation = `Extreme cold conditions: ${travelingExposure} exposure/day when traveling. ${campingExposure} exposure/day when camping.`;
        } else if (weather.temperature === 'bitter' || weather.temperature === 'sweltering') {
            if (!gear.weatherAppropriateGear) travelingExposure = 2;
            if (!gear.campSetup) campingExposure = 2;
            explanation = `${this._capitalizeWeather(weather.temperature)} temperature: ${travelingExposure} exposure/day when traveling. ${campingExposure} exposure/day when camping.`;
        } else if (weather.temperature === 'chilly' || weather.temperature === 'hot') {
            if (!gear.weatherAppropriateGear) travelingExposure = 1;
            if (!gear.campSetup) campingExposure = 1;
            explanation = `${this._capitalizeWeather(weather.temperature)} temperature: ${travelingExposure} exposure/day when traveling. ${campingExposure} exposure/day when camping.`;
        } else {
            explanation = 'Normal weather conditions: No exposure gain.';
        }
        
        return { travelingExposure, campingExposure, explanation };
    }
    
    async _onWeatherConditionChange(event) {
        const select = event.currentTarget;
        const condition = select.dataset.condition;
        const value = select.value;
        
        await this.actor.setFlag('wfrp4e-travel-system', `weather.conditions.${condition}`, value);
    }
    
    async _onWeatherOverride(event) {
        const select = event.currentTarget;
        const weatherType = select.dataset.weatherType;
        const value = select.value;
        
        await this.actor.setFlag('wfrp4e-travel-system', `weather.current.${weatherType}`, value);
        this.render(false);
    }
    
    async _onWeatherGearChange(event) {
        const checkbox = event.currentTarget;
        const gearType = checkbox.dataset.gear;
        const checked = checkbox.checked;
        
        await this.actor.setFlag('wfrp4e-travel-system', `weather.gear.${gearType}`, checked);
        this.render(false);
    }
    
    // ========================================
    // SECTION 6: EVENT SYSTEM
    // ========================================
    
    _getEventTable() {
        return [
            { range: "1-8", min: 1, max: 8, category: "Fortune", event: "Lucky Find", 
              description: "Stumble upon an old camp site or cache of supplies. Effect: +1 Camp Supplies, +1 JP" },
            { range: "9-16", min: 9, max: 16, category: "Fortune", event: "Nature's Bounty", 
              description: "The party finds a surprising amount of foragable food right along the path. Effect: +1 Provisions" },
            { range: "17-25", min: 17, max: 25, category: "Fortune", event: "Beautiful Day", 
              description: "The sun is shining, the skies are clear, and the path is clear. Effect: -1 Weariness" },
            { range: "26-33", min: 26, max: 33, category: "Misfortune", event: "Frayed Nerves", 
              description: "Tension boils over among the party as exhaustion sets in. Effect: +1 Weariness" },
            { range: "34-41", min: 34, max: 41, category: "Misfortune", event: "Lost Provisions", 
              description: "Provisions are lost to spoilage, wild animals, etc. Effect: -1 Provisions, -1d3 Provisions (Failure)" },
            { range: "42-50", min: 42, max: 50, category: "Misfortune", event: "Broken Equipment", 
              description: "A strap, wagon axle, or pack harness breaks mid-travel. Effect: +1 Weariness, Do not move that day as repairs are lengthier than expected (On Failure)" },
            { range: "51-58", min: 51, max: 58, category: "Encounter", event: "Other Travelers", 
              description: "The party runs into another group of creatures. These may be human (or not) and could be friendly or hostile. Effect: Social encounter" },
            { range: "59-66", min: 59, max: 66, category: "Navigation", event: "Fork in the Path", 
              description: "Unexpected fork in the path and the party isn't sure which is the correct way to go. Effect: Lost! on failure. When Lost!, move to a random adjacent hex" },
            { range: "67-75", min: 67, max: 75, category: "Terrain", event: "Broken Terrain", 
              description: "The terrain is suddenly extremely difficult to bypass. A river has overflown, a section of trail has collapsed, etc. You must find a way to bypass the problem area or find a new route. Effect: +1 Weariness, Must move to a different hex other than the one originally planned (on failure)" },
            { range: "76-83", min: 76, max: 83, category: "Hazard", event: "Sudden Illness", 
              description: "Exhaustion, foul water, or biting insects sap the party's strength. (GM picks a disease to roll against) Effect: +1 Weariness, Gain disease on failure" },
            { range: "84-91", min: 84, max: 91, category: "Weather", event: "Sudden Storm", 
              description: "The weather takes a sudden turn for the worse and a Storm appears. In cold weather, this becomes a Blizzard. Effect: Weather becomes a Thunderstorm. If temperature is Bitter, weather becomes a Blizzard" },
            { range: "92-100", min: 92, max: 100, category: "Combat", event: "Enemies", 
              description: "A small group of enemies is encountered appropriate to the party's location. Effect: Combat encounter. Chance to become Ambushed!" }
        ];
    }
    
    // ========================================
    // SECTION 7: DAILY PROCESSING
    // ========================================
    
    async _onDaysOnRoadIncrease() {
        const provisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.provisions') || 0;
        const hunger = this.actor.getFlag('wfrp4e-travel-system', 'resources.hunger') || 0;
        const exposure = this.actor.getFlag('wfrp4e-travel-system', 'resources.exposure') || 0;
        const jp = this.actor.getFlag('wfrp4e-travel-system', 'resources.journeyPool.current') || 0;
        const mountProvisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.mountProvisions') || 0;
        const hasMounts = this.actor.getFlag('wfrp4e-travel-system', 'travel.hasMounts') || false;
        const grazing = this.actor.getFlag('wfrp4e-travel-system', 'travel.mountsGrazing') || false;
        const isTraveling = this.actor.getFlag('wfrp4e-travel-system', 'travel.status') === 'traveling';
        
        const weather = this.actor.getFlag('wfrp4e-travel-system', 'weather.current') || {};
        const extremeWeather = this._checkExtremeWeather();
        const isBlizzard = extremeWeather.type === 'blizzard';
        
        // Calculate daily needs
        const extremeTemp = (weather.temperature === 'sweltering' || weather.temperature === 'bitter');
        const provisionsNeeded = extremeTemp ? 2 : 1;
        const mountProvisionsNeeded = (hasMounts && !grazing) ? 1 : 0;
        
        // Build preview
        const preview = [];
        preview.push(`Provisions: -${provisionsNeeded} (${extremeTemp ? '2x due to extreme temperature' : 'normal'})`);
        if (mountProvisionsNeeded > 0) {
            preview.push(`Mount Provisions: -${mountProvisionsNeeded}`);
        }
        if (hunger > 0 && provisions >= provisionsNeeded) {
            preview.push(`Hunger: Reset to 0`);
        }
        
        const exposureCalc = this._calculateExposure();
        const exposureGain = isTraveling ? exposureCalc.travelingExposure : exposureCalc.campingExposure;
        if (exposureGain > 0) {
            preview.push(`Exposure: +${exposureGain}`);
        } else if (exposureGain < 1 && !isBlizzard && extremeWeather.type !== 'extreme-cold' && exposure > 0) {
            preview.push(`Exposure: Reset to 0 (favorable conditions)`);
        }
        
        if (isBlizzard && isTraveling) {
            preview.push(jp > 0 ? `Journey Pool: -1 (Blizzard)` : `Weariness: +1 (Blizzard, JP exhausted)`);
        }
        
        // Confirm
        const proceed = await Dialog.confirm({
            title: 'Increase Days on Road',
            content: `<p>This will process the following daily effects:</p><ul>${preview.map(p => `<li>${p}</li>`).join('')}</ul><p>Continue?</p>`
        });
        
        if (!proceed) return;
        
        // Execute daily processing
        const summary = [];
        let newHunger = hunger;
        
        // Step 1a: Consume provisions
        if (provisions >= provisionsNeeded) {
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.provisions', provisions - provisionsNeeded);
            summary.push(`Consumed ${provisionsNeeded} provisions`);
        } else {
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.provisions', 0);
            newHunger = Math.min(hunger + 1, 3);
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.hunger', newHunger);
            summary.push(`⚠ Provisions exhausted! Hunger +1 (now ${newHunger})`);
        }
        
        // Step 1b: Consume mount provisions
        if (mountProvisionsNeeded > 0) {
            if (mountProvisions >= mountProvisionsNeeded) {
                await this.actor.setFlag('wfrp4e-travel-system', 'resources.mountProvisions', mountProvisions - mountProvisionsNeeded);
                summary.push(`Consumed ${mountProvisionsNeeded} mount provisions`);
            } else {
                await this.actor.setFlag('wfrp4e-travel-system', 'resources.mountProvisions', 0);
                summary.push(`⚠ Mount provisions exhausted!`);
            }
        }
        
        // Step 2: Hunger recovery
        const newProvisions = this.actor.getFlag('wfrp4e-travel-system', 'resources.provisions') || 0;
        if (hunger > 0 && newProvisions > 0) {
            newHunger = 0;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.hunger', 0);
            summary.push(`Hunger satisfied (reset to 0)`);
        }
        
        // Step 3: Exposure
        let newExposure = exposure;
        if (exposureGain < 1 && !isBlizzard && extremeWeather.type !== 'extreme-cold') {
            if (exposure > 0) {
                newExposure = 0;
                await this.actor.setFlag('wfrp4e-travel-system', 'resources.exposure', 0);
                summary.push(`Exposure reset to 0 (favorable conditions)`);
            }
        } else if (exposureGain > 0) {
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
        
        // Step 4b: Thunder Storm weariness
        let thunderStormWeariness = 0;
        const isThunderStorm = extremeWeather.type === 'thunder-storm';
        const hasGear = this.actor.getFlag('wfrp4e-travel-system', 'weather.gear.weatherAppropriateGear') || false;
        const hasCampSetup = this.actor.getFlag('wfrp4e-travel-system', 'weather.gear.campSetup') || false;
        
        if (isThunderStorm) {
            if (isTraveling) {
                thunderStormWeariness = hasGear ? 1 : 2;
                summary.push(`Thunder Storm: +${thunderStormWeariness} weariness (${hasGear ? 'with gear' : 'without gear'})`);
            } else if (!hasCampSetup) {
                thunderStormWeariness = 1;
                summary.push(`Thunder Storm: +1 weariness (no camp setup)`);
            }
        }
        
        // Step 5: Daily weariness
        let totalWearinessGain = newHunger + newExposure + blizzardWeariness + thunderStormWeariness;
        if (totalWearinessGain > 0) {
            let parts = [];
            if (newHunger > 0) parts.push(`Hunger: ${newHunger}`);
            if (newExposure > 0) parts.push(`Exposure: ${newExposure}`);
            if (blizzardWeariness > 0) parts.push(`Blizzard: ${blizzardWeariness}`);
            if (thunderStormWeariness > 0) parts.push(`Thunder Storm: ${thunderStormWeariness}`);
            summary.push(`Daily strain: +${totalWearinessGain} weariness (${parts.join(', ')})`);
        }
        
        // Step 6: Weariness overflow
        if (totalWearinessGain > 0) {
            const result = await this._addWeariness(totalWearinessGain);
            if (result.fatigueGained > 0) {
                summary.push(`⚠ Weariness overflow! Gained +${result.fatigueGained} Travel Fatigue (${result.newWeariness} weariness remaining)`);
            }
        }
        
        // Step 7: Exposure wound damage
        const linkedCharacters = this._getLinkedCharacters(this.actor.getFlag('wfrp4e-travel-system', 'linkedCharacters') || []);
        const woundedCharacters = [];
        
        for (const char of linkedCharacters) {
            if (newExposure > char.tb) {
                const actor = game.actors.get(char.id);
                if (actor) {
                    const currentWounds = actor.system.status.wounds.value;
                    const newWounds = Math.max(0, currentWounds - 1);
                    await actor.update({'system.status.wounds.value': newWounds});
                    woundedCharacters.push(`${char.name}: ${newWounds}/${char.wounds.max} wounds (exposure > TB)`);
                }
            }
        }
        
        if (woundedCharacters.length > 0) {
            summary.push(`⚠ <strong>Exposure damage:</strong><br>${woundedCharacters.join('<br>')}`);
        }
        
        // Step 8: Increase Days on Road
        const currentDays = this.actor.getFlag('wfrp4e-travel-system', 'journey.daysOnRoad') || 0;
        await this.actor.setFlag('wfrp4e-travel-system', 'journey.daysOnRoad', currentDays + 1);
        
        ui.notifications.info(`<strong>Day ${currentDays + 1}</strong><br>` + summary.join('<br>'));
        this.render(false);
    }
}
