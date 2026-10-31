import { signal } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AIQueryResult, PlatformStatus } from '../../core/models';
import { MetaService } from '../../core/services/meta.service';
import { QueryService } from '../../core/services/query.service';
import { ToastService } from '../../core/services/toast.service';
import { QueryComponent } from './query.component';

describe('QueryComponent preview guide', () => {
  const ask = jasmine.createSpy('ask');
  const status = signal<PlatformStatus | null>(null);
  const error = jasmine.createSpy('error');
  const response: AIQueryResult = {
    question: 'What can CloudScope do?',
    answer: 'Explore **fictional** data.',
    source: 'Local demo engine',
    processingTime: '1 ms',
    success: true,
    suggestedQuestions: ['Is this real data?'],
    relatedPage: { label: 'Open dashboard', path: '/dashboard' }
  };

  beforeEach(async () => {
    status.set(null);
    ask.calls.reset();
    error.calls.reset();
    ask.and.returnValue(of(response));
    await TestBed.configureTestingModule({
      imports: [QueryComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MetaService, useValue: { demoMode: signal(true), status } },
        { provide: QueryService, useValue: { ask, getSuggestions: () => of([]) } },
        { provide: ToastService, useValue: { error } }
      ]
    }).compileComponents();
  });

  it('offers starter questions, next steps and safe navigation, and clears chat', fakeAsync(() => {
    const fixture = TestBed.createComponent(QueryComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('rule-based query engine');
    const starter = element.querySelector<HTMLButtonElement>('.starter-prompts button');
    expect(starter).not.toBeNull();
    starter?.click();
    fixture.detectChanges();
    tick();
    expect(ask).toHaveBeenCalledWith('What can CloudScope do?', undefined);
    expect(element.querySelector('.answer strong')?.textContent).toBe('fictional');
    expect(element.querySelector('.next-link')?.textContent).toContain('Open dashboard');
    const suggestion = element.querySelector<HTMLButtonElement>('.next-steps button');
    expect(suggestion?.textContent).toContain('Is this real data?');
    suggestion?.click();
    fixture.detectChanges();
    tick();
    expect(ask).toHaveBeenCalledWith('Is this real data?', undefined);
    expect(fixture.componentInstance.transcript().length).toBe(2);
    fixture.componentInstance.clearChat();
    fixture.detectChanges();
    expect(fixture.componentInstance.transcript().length).toBe(0);
    expect(element.querySelector('.starter-prompts')).not.toBeNull();
    expect(
      fixture.componentInstance.safeRelatedPage({ label: 'Bad', path: '//evil.example' })
    ).toBeNull();
  }));

  it('discloses providers and sends only three recent exchanges when preview AI is configured', fakeAsync(() => {
    status.set({
      version: 'demo',
      demoMode: true,
      aiMode: 'FreeAIDemo',
      storageProvider: 'InMemory',
      configuredProviders: [],
      resourceCount: 0,
      relationshipCount: 0,
      serverTimeUtc: ''
    });
    const fixture = TestBed.createComponent(QueryComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('sent to the configured AI provider');
    expect(element.textContent).toContain('AI provider configured');
    for (let i = 1; i <= 4; i++) {
      fixture.componentInstance.question = `Question ${i}`;
      fixture.componentInstance.ask();
    }
    fixture.detectChanges();
    tick();
    expect(ask.calls.mostRecent().args).toEqual([
      'Question 4',
      [
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: response.answer },
        { role: 'user', content: 'Question 2' },
        { role: 'assistant', content: response.answer },
        { role: 'user', content: 'Question 3' },
        { role: 'assistant', content: response.answer }
      ]
    ]);
    fixture.componentInstance.question = 'Question 5';
    fixture.componentInstance.ask();
    fixture.detectChanges();
    tick();
    expect(ask.calls.mostRecent().args[1].length).toBe(6);
    expect(ask.calls.mostRecent().args[1][0].content).toBe('Question 2');
    fixture.componentInstance.clearChat();
    fixture.componentInstance.question = 'New topic';
    fixture.componentInstance.ask();
    tick();
    expect(ask.calls.mostRecent().args).toEqual(['New topic', []]);
  }));

  it('renders only allowlisted documentation links, ignoring forged URLs', () => {
    const fixture = TestBed.createComponent(QueryComponent);
    const refs = fixture.componentInstance.safeReferences([
      { id: 'graph', title: 'forged', url: 'https://evil.example' },
      { id: 'graph', title: 'duplicate', url: 'https://evil.example' },
      { id: '__proto__', title: 'bad', url: 'https://evil.example' }
    ]);
    expect(refs.length).toBe(1);
    expect(refs[0].title).toBe('CloudScope blast radius');
    expect(refs[0].url).toBe(
      'https://github.com/Brandonflex/CloudScope/blob/main/docs/architecture.md#blast-radius'
    );
  });

  it('keeps a failed question available for retry', () => {
    ask.and.returnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(QueryComponent);
    fixture.detectChanges();
    fixture.componentInstance.question = 'How do I get started?';
    fixture.componentInstance.ask();
    expect(fixture.componentInstance.question).toBe('How do I get started?');
    expect(fixture.componentInstance.thinking()).toBeFalse();
    expect(error).toHaveBeenCalledWith(
      'The query engine did not respond. Your question is ready to retry.'
    );
  });
});
