import type { Locale } from "@/lib/locale";

/** 12/11/2026: the task board: rows, drag and drop, people in charge, material, the club's own categories. */
type Copy = {
  ownTemplates: string;
  readyTemplates: string;
  move: string;
  moveHelp: string;
  moveUp: string;
  moveDown: string;
  moveTo: string;
  moved: string;
  assign: string;
  assignTitle: string;
  assignNone: string;
  assignSaved: string;
  materials: string;
  materialsTitle: string;
  materialsIntro: string;
  materialsAdd: string;
  materialsLabel: string;
  materialsRemove: string;
  materialsSaved: string;
  edit: string;
  dueFor: string;
  doneCount: string;
  newCategory: string;
  categoryName: string;
  renameCategory: string;
  deleteCategory: string;
  groupUp: string;
  groupDown: string;
  categorySaved: string;
  quickDate: string;
  quickPlaceholder: string;
  save: string;
  cancel: string;
  close: string;
};

const fr: Copy = {
  ownTemplates: "Vos modèles",
  readyTemplates: "Prêts à l'emploi",
  move: "Déplacer : {title}",
  moveHelp: "Flèches haut et bas pour déplacer la tâche, ou glissez-la avec la souris.",
  moveUp: "Monter",
  moveDown: "Descendre",
  moveTo: "Déplacer vers",
  moved: "Tâche déplacée.",
  assign: "Responsables : {title}",
  assignTitle: "Qui s'en charge ?",
  assignNone: "Personne pour l'instant.",
  assignSaved: "Responsables enregistrés.",
  materials: "Matériel : {title}",
  materialsTitle: "Matériel à prévoir",
  materialsIntro: "Ce qu'il faut emporter ou préparer pour cette tâche.",
  materialsAdd: "Ajouter",
  materialsLabel: "Un élément (ballons, batteries, trousse de secours…)",
  materialsRemove: "Retirer {item}",
  materialsSaved: "Matériel enregistré.",
  edit: "Modifier : {title}",
  dueFor: "Pour le {day}",
  doneCount: "{done}/{total}",
  newCategory: "Nouvelle catégorie",
  categoryName: "Nom de la catégorie",
  renameCategory: "Renommer {name}",
  deleteCategory: "Supprimer {name}",
  groupUp: "Monter la catégorie {name}",
  groupDown: "Descendre la catégorie {name}",
  categorySaved: "Catégorie enregistrée.",
  quickDate: "Pour le",
  quickPlaceholder: "Nouvelle tâche à préparer…",
  save: "Enregistrer",
  cancel: "Annuler",
  close: "Fermer",
};
const nl: Copy = {
  ownTemplates: "Uw sjablonen",
  readyTemplates: "Klaar voor gebruik",
  move: "Verplaatsen: {title}",
  moveHelp: "Pijltjes omhoog en omlaag om de taak te verplaatsen, of sleep ze met de muis.",
  moveUp: "Omhoog",
  moveDown: "Omlaag",
  moveTo: "Verplaatsen naar",
  moved: "Taak verplaatst.",
  assign: "Verantwoordelijken: {title}",
  assignTitle: "Wie neemt het op zich?",
  assignNone: "Nog niemand.",
  assignSaved: "Verantwoordelijken opgeslagen.",
  materials: "Materiaal: {title}",
  materialsTitle: "Te voorzien materiaal",
  materialsIntro: "Wat er mee moet of klaargemaakt moet worden voor deze taak.",
  materialsAdd: "Toevoegen",
  materialsLabel: "Een element (ballen, batterijen, EHBO-koffer…)",
  materialsRemove: "{item} verwijderen",
  materialsSaved: "Materiaal opgeslagen.",
  edit: "Wijzigen: {title}",
  dueFor: "Tegen {day}",
  doneCount: "{done}/{total}",
  newCategory: "Nieuwe categorie",
  categoryName: "Naam van de categorie",
  renameCategory: "{name} hernoemen",
  deleteCategory: "{name} verwijderen",
  groupUp: "Categorie {name} omhoog",
  groupDown: "Categorie {name} omlaag",
  categorySaved: "Categorie opgeslagen.",
  quickDate: "Tegen",
  quickPlaceholder: "Nieuwe voor te bereiden taak…",
  save: "Opslaan",
  cancel: "Annuleren",
  close: "Sluiten",
};
const en: Copy = {
  ownTemplates: "Your templates",
  readyTemplates: "Ready to use",
  move: "Move: {title}",
  moveHelp: "Up and down arrows to move the task, or drag it with the mouse.",
  moveUp: "Move up",
  moveDown: "Move down",
  moveTo: "Move to",
  moved: "Task moved.",
  assign: "People in charge: {title}",
  assignTitle: "Who takes care of it?",
  assignNone: "Nobody yet.",
  assignSaved: "People in charge saved.",
  materials: "Material: {title}",
  materialsTitle: "Material to plan",
  materialsIntro: "What to bring or prepare for this task.",
  materialsAdd: "Add",
  materialsLabel: "An item (balls, batteries, first aid kit…)",
  materialsRemove: "Remove {item}",
  materialsSaved: "Material saved.",
  edit: "Edit: {title}",
  dueFor: "By {day}",
  doneCount: "{done}/{total}",
  newCategory: "New category",
  categoryName: "Category name",
  renameCategory: "Rename {name}",
  deleteCategory: "Delete {name}",
  groupUp: "Move the category {name} up",
  groupDown: "Move the category {name} down",
  categorySaved: "Category saved.",
  quickDate: "By",
  quickPlaceholder: "New task to prepare…",
  save: "Save",
  cancel: "Cancel",
  close: "Close",
};

export const boardCopy: Record<Locale, Copy> = { fr, nl, en };
