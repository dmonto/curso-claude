import { Component, input } from "@angular/core";
import { AssistantContentBlock } from "./assistant.types";

@Component({
  selector: "app-assistant-response-renderer",
  standalone: true,
  template: `
    <div class="response-blocks">
      @for (block of blocks(); track $index) {
        @switch (block.type) {
          @case ("summary") {
            <section class="response-block response-block--summary">
              @if (block.title) { <strong>{{ block.title }}</strong> }
              <p>{{ block.text }}</p>
            </section>
          }

          @case ("paragraph") {
            <section class="response-block">
              @if (block.title) { <strong>{{ block.title }}</strong> }
              <p>{{ block.text }}</p>
            </section>
          }

          @case ("bullet_list") {
            <section class="response-block">
              @if (block.title) { <strong>{{ block.title }}</strong> }
              <ul>
                @for (item of block.items; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </section>
          }

          @case ("key_value") {
            <section class="response-block">
              @if (block.title) { <strong>{{ block.title }}</strong> }
              <dl>
                @for (item of block.items; track item.key) {
                  <div class="response-block__pair">
                    <dt>{{ item.key }}</dt>
                    <dd>{{ item.value }}</dd>
                  </div>
                }
              </dl>
            </section>
          }

          @case ("warning") {
            <section class="response-block response-block--warning">
              @if (block.title) { <strong>{{ block.title }}</strong> }
              <p>{{ block.text }}</p>
            </section>
          }

          @case ("reference") {
            <section class="response-block response-block--references">
              @if (block.title) { <strong>{{ block.title }}</strong> }
              <ul>
                @for (item of block.items; track item.sourceId) {
                  <li>{{ item.label }} <small>{{ item.sourceType }} · {{ item.sourceId }}</small></li>
                }
              </ul>
            </section>
          }
        }
      }
    </div>
  `,
  styles: [`
    .response-blocks {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .response-block p {
      margin: 4px 0 0;
      white-space: pre-wrap;
      line-height: 1.4;
    }

    .response-block ul {
      margin: 6px 0 0;
      padding-left: 18px;
    }

    .response-block dl {
      margin: 6px 0 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .response-block__pair {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 8px;
    }

    dt {
      font-weight: 600;
      color: #555;
    }

    dd {
      margin: 0;
    }

    .response-block--warning {
      border: 1px solid #ead7a4;
      border-radius: 8px;
      padding: 8px;
      background: #fffaf0;
    }

    .response-block--references small {
      color: #777;
    }
  `]
})
export class AssistantResponseRendererComponent {
  readonly blocks = input.required<AssistantContentBlock[]>();
}
