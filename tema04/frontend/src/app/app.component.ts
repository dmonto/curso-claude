import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { AssistantPanelComponent } from "./assistant/assistant-panel.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, AssistantPanelComponent],
  template: `
    <router-outlet />
    <app-assistant-panel />
  `
})
export class AppComponent {}
