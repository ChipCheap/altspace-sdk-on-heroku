/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import { PrimitiveShape, ActorTransform, Sound, Light, LookAtMode, RigidBody }
	from '@microsoft/mixed-reality-extension-sdk';
import { Vector3 } from '@microsoft/mixed-reality-extension-sdk';

/**
 * The structure of a hat entry in the hat database.
 */
type HatDescriptor = {
	displayName: string;
	resourceName: string;
	scale: {
		x: number;
		y: number;
		z: number;
	};
	rotation: {
		x: number;
		y: number;
		z: number;
	};
	position: {
		x: number;
		y: number;
		z: number;
	};
};

/**
 * The structure of the hat database.
 */
type HatDatabase = {
	[key: string]: HatDescriptor;
};

// Load the database of hats.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HatDatabase: HatDatabase = require('../public/hats.json');

/**
 * The main class of this app. All the logic goes here.
 */
export default class TicTacToe {
	private assets: MRE.AssetContainer;
	private hatAssets: MRE.AssetContainer;
	private lastSaved: MRE.Actor = null;
	private selectedCube: MRE.Actor = null
	private prefabs: { [key: string]: MRE.Prefab } = {};
	private attachedHats = new Map<MRE.Guid, MRE.Actor>();;
	private grabFlag = false;
	private handtrackers: { [key: string]: MRE.Actor };

	constructor(private context: MRE.Context) {
		this.context.onStarted(() => this.started());
	}

	/**
	 * Once the context is "started", initialize the app.
	 */
	private async started() {
		// set up somewhere to store loaded assets (meshes, textures, animations, gltfs, etc.)
		this.assets = new MRE.AssetContainer(this.context);
		this.hatAssets = new MRE.AssetContainer(this.context);

		// await this.startedImpl();

		// Load a glTF model before we use it
		const cubeData = await this.assets.loadGltf('altspace-cube.glb', "box");

		let cubeCounter = 1;
		const horizontalDim = 7
		const verticalDim = 7
		for (let tileIndexX = 0; tileIndexX < horizontalDim; tileIndexX++) {
			for (let tileIndexY = 0; tileIndexY < verticalDim; tileIndexY++) {

				// spawn a copy of the glTF model
				const cube = MRE.Actor.CreateFromPrefab(this.context, {
					// using the data we loaded earlier
					firstPrefabFrom: cubeData,
					// Also apply the following generic actor properties.
					actor: {
						name: 'Altspace Cube',
						collider: {
							geometry: { shape: MRE.ColliderType.Box }
						},
						transform: {
							local: {
								position: { x: tileIndexX, y: tileIndexY, z: 0 },
								scale: { x: 0.4, y: 0.4, z: 0.4 }
							}
						}
					}
				});

				// give boxes gravity and a rigid body
				cube.enableRigidBody(new RigidBody(cube))
				cube.rigidBody.enabled = true
				cube.rigidBody.mass = 0.5
				cube.rigidBody.useGravity = true
				cube.grabbable = true
				cubeCounter++
			}
		}
	}

	/**
	 * Creates numbering on the boxes 
	 * @param tileIndexX x coord
	 * @param tileIndexY y coord
	 * @param cube the cube to attach number to
	 * @param cubeCounter the number the text will show
	 */
	private createText(tileIndexX: number, tileIndexY: number, cube: MRE.Actor, cubeCounter: number) {

		// Create a new actor with no mesh, but some text.
		const text = MRE.Actor.Create(this.context, {
			actor: {
				parentId: cube.id,
				name: 'Text',
				transform: {
					app: { position: { x: tileIndexX, y: tileIndexY, z: -0.6 } }
				},
				text: {
					contents: "" + cubeCounter,
					anchor: MRE.TextAnchorLocation.MiddleCenter,
					color: { r: 30 / 255, g: 206 / 255, b: 213 / 255 },
					height: 2
				}
			}
		});
	}

	/**
	 * Give the given cube behavior
	 * @param cube the cube to attach the behavior to
	 */
	private addBehavior(cube: MRE.Actor) {
		// Set up cursor interaction. We add the input behavior ButtonBehavior to the cube.
		// Button behaviors have two pairs of events: hover start/stop, and click start/stop.
		const buttonBehavior = cube.setBehavior(MRE.ButtonBehavior);

		// Trigger the grow/shrink animations on hover.
		buttonBehavior.onHover('enter', () => {
			// use the convenience function "AnimateTo" instead of creating the animation data in advance
			MRE.Animation.AnimateTo(this.context, cube, {
				destination: { transform: { local: { scale: { x: 0.5, y: 0.5, z: 0.5 } } } },
				duration: 0.3,
				easing: MRE.AnimationEaseCurves.EaseOutSine
			});
		});
		buttonBehavior.onHover('exit', () => {
			if (this.selectedCube !== cube) {
				MRE.Animation.AnimateTo(this.context, cube, {
					destination: { transform: { local: { scale: { x: 0.4, y: 0.4, z: 0.4 } } } },
					duration: 0.3,
					easing: MRE.AnimationEaseCurves.EaseOutSine
				});
			}
		});

		// When clicked, do a 360 sideways.
		buttonBehavior.onButton('pressed', () => {
			if (this.selectedCube === null) {
				this.selectedCube = cube
			} else {
				this.animateSwap(this.selectedCube, cube)
				this.selectedCube = null;
			}
		});
	}

	/**
	 * Unused, stored code.
	 */
	private createButtons() {

		// Create menu button
		const buttonMesh = this.assets.createBoxMesh('button', 0.3, 0.3, 0.01);

		// Create a clickable button.
		const gravButton = MRE.Actor.Create(this.context, {
			actor: {
				name: "grav",
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: { position: { x: -1, y: 3, z: 0 } }
				}
			}
		});

		gravButton.enableRigidBody(new RigidBody(gravButton));
		gravButton.rigidBody.enabled = true
		gravButton.rigidBody.mass = 0.5
		gravButton.rigidBody.useGravity = true

		gravButton.setCollider(MRE.ColliderType.Auto, false)

		gravButton.grabbable = true

		// Create a clickable button.
		const grabButton = MRE.Actor.Create(this.context, {
			actor: {
				name: "grab",
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: { position: { x: -1, y: 1, z: 0 } }
				}
			}
		});

		grabButton.grabbable = true

		grabButton.onGrab("begin", user => {
			console.log("grab begin")
		})

		grabButton.subscribe("transform")

		// Create a clickable button.
		const lookAtButton = MRE.Actor.Create(this.context, {
			actor: {
				name: "lookie",
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: { position: { x: -1, y: 2, z: 0 } }
				}
			}
		});

		lookAtButton.enableLookAt(grabButton, MRE.LookAtMode.TargetXY)

		// Create a clickable button.
		const button = MRE.Actor.Create(this.context, {
			actor: {
				name: "strawhat",
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: { position: { x: -1, y: 0, z: 0 } }
				}
			}
		});

		let behaviour: MRE.ButtonBehavior
		behaviour = button.setBehavior(MRE.ButtonBehavior);
		// Set a click handler on the button.
		behaviour.onClick(user => {
			console.log("button pressed");
			// this.wearHat("strawhat", user.id)

			let correctSound = new Sound(this.assets, {
				id: user.id,
				name: "correctSound",
				sound: {
					duration: 2,
					uri: "Correct-answer.mp3"
				}
			});

			this.assets.createSound("correct", correctSound)

			console.log(button.light)
			if (button.light === undefined) {

				const testLight = new Light();
				testLight.range = 3
				testLight.color = {
					r: 130,
					g: 255,
					b: 50,
				};
				testLight.type = "point"
				testLight.spotAngle = 100
				button.enableLight(testLight)
				console.log(button.light)
			} else {
				button.light.enabled = !button.light.enabled
			}
		});
	}

	private animateSwap(selected: MRE.Actor, swapTarget: MRE.Actor) {

		let temp = new Vector3(
			selected.transform.local.position.x,
			selected.transform.local.position.y,
			selected.transform.local.position.z
		)

		MRE.Animation.AnimateTo(this.context, selected, {
			destination: { transform: { local: { position: swapTarget.transform.local.position } } },
			duration: 0.3,
			easing: MRE.AnimationEaseCurves.EaseOutSine
		});

		MRE.Animation.AnimateTo(this.context, swapTarget, {
			destination: { transform: { local: { position: temp } } },
			duration: 0.3,
			easing: MRE.AnimationEaseCurves.EaseOutSine
		});

		selected.transform.local.position = swapTarget.transform.local.position
		swapTarget.transform.local.position = temp
	}

	// use () => {} syntax here to get proper scope binding when called via setTimeout()
	// if async is required, next line becomes private startedImpl = async () => {
	private startedImpl = async () => {
		// Preload all the hat models.
		await this.preloadHats();
	}

	/**
	 * Preload all hat resources. This makes instantiating them faster and more efficient.
	 */
	private preloadHats() {
		// Loop over the hat database, preloading each hat resource.
		// Return a promise of all the in-progress load promises. This
		// allows the caller to wait until all hats are done preloading
		// before continuing.
		return Promise.all(
			Object.keys(HatDatabase).map(hatId => {
				const hatRecord = HatDatabase[hatId];
				if (hatRecord.resourceName) {
					return this.hatAssets.loadGltf(hatRecord.resourceName)
						.then(assets => {
							this.prefabs[hatId] = assets.find(a => a.prefab !== null) as MRE.Prefab;
						})
						.catch(e => MRE.log.error("app", e));
				} else {
					return Promise.resolve();
				}
			}));
	}

	/**
	 * Instantiate a hat and attach it to the avatar's head.
	 * @param hatId The id of the hat in the hat database.
	 * @param userId The id of the user we will attach the hat to.
	 */
	private wearHat(hatId: string, userId: MRE.Guid) {

		const hatRecord = HatDatabase[hatId];

		// If the user selected 'none', then early out.
		if (!hatRecord.resourceName) {
			return;
		}

		// Create the hat model and attach it to the avatar's head.
		this.attachedHats.set(userId, MRE.Actor.CreateFromPrefab(this.context, {
			prefab: this.prefabs[hatId],
			actor: {
				transform: {
					local: {
						position: hatRecord.position,
						rotation: MRE.Quaternion.FromEulerAngles(
							hatRecord.rotation.x * MRE.DegreesToRadians,
							hatRecord.rotation.y * MRE.DegreesToRadians,
							hatRecord.rotation.z * MRE.DegreesToRadians),
						scale: hatRecord.scale,
					}
				},
				attachment: {
					attachPoint: 'right-hand',
					userId
				}
			}
		}));
	}
}
