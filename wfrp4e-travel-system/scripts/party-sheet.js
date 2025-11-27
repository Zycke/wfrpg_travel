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
        }
        
        // Calculate Journey Pool maximum (base 10 - travel fatigue)
        const baseJPMax = 10;
        const travelFatigue = context.resources.travelFatigue || 0;
        context.resources.journeyPool.max = Math.max(0, baseJPMax - travelFatigue);
        
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
                temperature: 'comfortable',
                precipitation: 'none',
                visibility: 'clear',
                wind: 'still'
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
                
                return {
                    id: actor.id,
                    name: actor.name,
                    img: actor.img,
                    tb: tb,
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
            (consumables.preservatives || 0) * 5 +
            (consumables.survivalTools || 0) * 4 +
            (consumables.medicinalHerbs || 0) * 3; // in silver shillings
        
        const specialItemsCost = (consumables.specializedEquipment || 0) * 10; // in silver shillings
        
        const totalSilver = provisionsCost + consumablesCost + specialItemsCost;
        const totalBrass = mountProvisionsCost;
        
        // Convert to gold if needed
        const goldCrowns = Math.floor(totalSilver / 20);
        const remainingSilver = totalSilver % 20;
        
        // Update display
        const sheet = this.element[0];
        if (sheet) {
            const provisionsElem = sheet.querySelector('[data-cost-type="provisions"]');
            const mountProvisionsElem = sheet.querySelector('[data-cost-type="mountProvisions"]');
            const consumablesElem = sheet.querySelector('[data-cost-type="consumables"]');
            const specialItemsElem = sheet.querySelector('[data-cost-type="specialItems"]');
            const totalElem = sheet.querySelector('[data-cost-type="total"]');
            
            if (provisionsElem) provisionsElem.textContent = `${provisionsCost} ss`;
            if (mountProvisionsElem) mountProvisionsElem.textContent = `${mountProvisionsCost} bp`;
            if (consumablesElem) consumablesElem.textContent = `${consumablesCost} ss`;
            if (specialItemsElem) specialItemsElem.textContent = `${specialItemsCost} ss`;
            
            if (totalElem) {
                if (goldCrowns > 0) {
                    totalElem.textContent = `${goldCrowns} gc ${remainingSilver} ss ${totalBrass} bp`;
                } else {
                    totalElem.textContent = `${remainingSilver} ss ${totalBrass} bp`;
                }
            }
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
            const currentWeariness = this.actor.getFlag('wfrp4e-travel-system', 'resources.weariness') || 0;
            await this.actor.setFlag('wfrp4e-travel-system', 'resources.weariness', currentWeariness + 1);
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
        }
    }
    
    // Helper methods for resource adjustments
    async _adjustWeariness(amount) {
        const current = this.actor.getFlag('wfrp4e-travel-system', 'resources.weariness') || 0;
        await this.actor.setFlag('wfrp4e-travel-system', 'resources.weariness', Math.max(0, current + amount));
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
}
