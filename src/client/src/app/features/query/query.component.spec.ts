import { signal } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AIQueryResult } from '../../core/models';
import { MetaService } from '../../core/services/meta.service';
import { QueryService } from '../../core/services/query.service';
import { ToastService } from '../../core/services/toast.service';
import { QueryComponent } from './query.component';

describe('QueryComponent preview guide', () => {
  const ask = jasmine.createSpy('ask');
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
    ask.calls.reset();
    error.calls.reset();
    ask.and.returnValue(of(response));
    await TestBed.configureTestingModule({
      imports: [QueryComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MetaService, useValue: { demoMode: signal(true) } },
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
    expect(ask).toHaveBeenCalledWith('What can CloudScope do?');
    expect(element.querySelector('.answer strong')?.textContent).toBe('fictional');
    expect(element.querySelector('.next-link')?.textContent).toContain('Open dashboard');
    const suggestion = element.querySelector<HTMLButtonElement>('.next-steps button');
    expect(suggestion?.textContent).toContain('Is this real data?');
    suggestion?.click();
    fixture.detectChanges();
    tick();
    expect(ask).toHaveBeenCalledWith('Is this real data?');
    expect(fixture.componentInstance.transcript().length).toBe(2);
    fixture.componentInstance.clearChat();
    fixture.detectChanges();
    expect(fixture.componentInstance.transcript().length).toBe(0);
    expect(element.querySelector('.starter-prompts')).not.toBeNull();
    expect(
      fixture.componentInstance.safeRelatedPage({ label: 'Bad', path: '//evil.example' })
    ).toBeNull();
  }));

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
