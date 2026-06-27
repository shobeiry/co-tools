import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JiraDashboard } from './jira-dashboard';

describe('JiraDashboard', () => {
  let component: JiraDashboard;
  let fixture: ComponentFixture<JiraDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JiraDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(JiraDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
