import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RahkaranReporter } from './rahkaran-reporter';

describe('RahkaranReporter', () => {
  let component: RahkaranReporter;
  let fixture: ComponentFixture<RahkaranReporter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RahkaranReporter],
    }).compileComponents();

    fixture = TestBed.createComponent(RahkaranReporter);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
