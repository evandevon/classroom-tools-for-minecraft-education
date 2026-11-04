import { Player } from "@minecraft/server";
import { Module, ModuleManager } from "../../module-manager.ts";
import { SceneManager } from "../scene_manager/scene-manager.ts";
import { MainScene } from "./main.scene.ts";
import { SceneContext } from "../scene_manager/scene-context.ts";
import { FocusModeService } from "../focus_mode/focus_mode.service.ts";
import { ItemService } from "../item/item.service.ts";
import { StudentsService } from "../students/students.service.ts";

/**
 * Interface for button configuration
 */
export interface ButtonConfig {
  labelKey: string;
  iconPath: string;
  handler: (sceneManager: SceneManager, context: SceneContext) => void;
  weight?: number; // Optional weight for sorting buttons
  visible?: (player: Player) => boolean; // Hide the button when it would do nothing
  trustedStudents?: boolean; // Also show it to trusted students
}

/**
 * Service for managing the main menu.
 */
export class MainService implements Module {
  /**
   * Unique identifier for the module.
   */
  readonly id: string = "main";

  private readonly moduleManager: ModuleManager;
  private itemService: ItemService | undefined;
  private students: StudentsService | undefined;

  constructor(moduleManager: ModuleManager) {
    this.moduleManager = moduleManager;
  }

  initialize(): void {
    this.itemService = this.moduleManager.getModule<ItemService>(
      ItemService.id,
    );
    this.students = this.moduleManager.getModule<StudentsService>(
      StudentsService.id,
    );

    this.itemService?.registerScene("main", {
      priority: -10000,
      condition_callback: (player) => {
        if (this.students?.isTeacher(player.id)) {
          return true;
        } else if (
          this.students?.isTrustedStudent(player.id) &&
          !this.moduleManager.getModule<FocusModeService>(FocusModeService.id)
            ?.isFrozen(player.id)
        ) {
          return true;
        } else {
          // Send a message to the player that they are not allowed to use the educator tool
          player.sendMessage({
            translate: "edu_tools.message.no_host",
          });
        }
        return false;
      },
    });
  }

  /**
   * Registry of buttons for the main menu
   */
  private buttonRegistry: Map<string, ButtonConfig> = new Map();

  /**
   * Registers a button with its configuration
   * @param buttonId - Unique identifier for the button
   * @param config - Button configuration including label, icon, and handler
   */
  isTeacher(playerId: string): boolean {
    return !!this.students?.isTeacher(playerId);
  }

  public registerButton(buttonId: string, config: ButtonConfig): void {
    this.buttonRegistry.set(buttonId, config);
  }

  /**
   * Gets all registered buttons sorted by weight.
   * Buttons with higher weight will appear later in the list.
   * @returns Map of button configurations
   */
  public getRegisteredButtons(): Map<string, ButtonConfig> {
    const sortedButtons = new Map(
      [...this.buttonRegistry.entries()].sort((a, b) => {
        const weightA = a[1].weight || 0;
        const weightB = b[1].weight || 0;
        return weightA - weightB; // Sort in descending order
      }),
    );
    return sortedButtons;
  }

  /**
   * Registers all scenes related to the main menu.
   * @param sceneManager - The SceneManager to register scenes with.
   */
  public registerScenes(sceneManager: SceneManager): void {
    // Register default buttons
    this.registerDefaultButtons();

    sceneManager.registerScene(
      MainScene.id,
      (manager: SceneManager, context: SceneContext) => {
        // Create a new instance of MainScene with this service
        new MainScene(manager, context, this);
      },
    );
  }

  /**
   * Registers the default buttons for the main menu
   */
  private registerDefaultButtons(): void {
  }
}
